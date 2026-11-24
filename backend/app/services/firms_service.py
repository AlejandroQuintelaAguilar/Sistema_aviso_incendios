"""Servicio de integración satelital con NASA FIRMS (VIIRS / MODIS).

Actúa como proxy seguro en backend con caché en memoria y correlación
geográfica Haversine contra zonas de riesgo, avisos en triage e incidentes activos.
"""

import csv
import io
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from app.middleware.error_handler import ValidationError
from app.models.aviso_incendio import AvisoIncendio
from app.models.incidente import Incidente
from app.models.referencias import ZonaRiesgoRef
from app.services.referencias_service import (
    extraer_geometria_zona,
    punto_en_poligono,
)
from app.utils.geo_utils import extract_coordinates, haversine_km

FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SENSORES_SOPORTADOS: tuple[str, ...] = (
    "VIIRS_NOAA20_NRT",
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA21_NRT",
    "MODIS_NRT",
)
DEFAULT_SENSOR = "VIIRS_NOAA20_NRT"
# Bounding box nacional de Bolivia (west, south, east, north) y referencia regional Cochabamba
BOLIVIA_BBOX: tuple[float, float, float, float] = (-69.65, -22.90, -57.45, -9.65)
COCHABAMBA_BBOX: tuple[float, float, float, float] = (-67.10, -18.60, -64.20, -16.40)

# Polígono aproximado de frontera nacional de Bolivia (lng, lat) para evitar focos de países vecinos
BOLIVIA_FRONTERA_POLY: tuple[tuple[float, float], ...] = (
    (-69.59, -10.95), (-68.67, -11.02), (-67.18, -10.32), (-66.65, -9.88),
    (-65.34, -9.68),  (-65.30, -10.45), (-65.00, -11.90), (-64.20, -12.45),
    (-62.85, -12.90), (-62.10, -13.30), (-60.38, -13.62), (-60.20, -15.05),
    (-58.40, -16.28), (-57.62, -17.55), (-57.46, -18.15), (-57.65, -19.05),
    (-58.17, -20.17), (-59.95, -19.32), (-61.75, -19.62), (-62.26, -20.48),
    (-62.27, -22.25), (-62.65, -22.25), (-63.98, -22.02), (-64.25, -22.86),
    (-64.60, -22.85), (-64.96, -22.12), (-65.20, -22.10), (-66.22, -21.78),
    (-67.15, -22.88), (-67.88, -22.82), (-68.52, -21.25), (-68.45, -19.45),
    (-69.10, -18.35), (-69.62, -17.50), (-69.08, -16.22), (-69.38, -15.25),
    (-68.88, -14.20), (-68.67, -12.50), (-69.55, -11.90),
)

CACHE_TTL_SECONDS = 600
RADIO_CORRELACION_KM = 3.0
RADIO_ZONA_KM = 15.0

TZ_BOLIVIA = timezone(timedelta(hours=-4))

# Caché en memoria a nivel de proceso: clave -> (monotonic_ts, raw_points, consultado_iso)
_FIRMS_CACHE: dict[str, tuple[float, list[dict[str, Any]], str]] = {}


def limpiar_cache_firms() -> None:
    """Limpia la caché en memoria (útil para pruebas unitarias)."""
    _FIRMS_CACHE.clear()


def _punto_en_bolivia(lat: float, lng: float) -> bool:
    """Verifica mediante ray-casting si un punto cae dentro del perímetro aproximado de Bolivia."""
    inside = False
    n = len(BOLIVIA_FRONTERA_POLY)
    j = n - 1
    for i in range(n):
        xi, yi = BOLIVIA_FRONTERA_POLY[i]
        xj, yj = BOLIVIA_FRONTERA_POLY[j]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def _estimar_departamento_bolivia(lat: float, lng: float) -> str:
    """Asigna de forma aproximada el departamento de Bolivia según coordenadas."""
    if lat >= -12.50 and lng <= -66.20:
        return "Pando"
    if lat >= -15.85 and -67.55 <= lng <= -63.20:
        return "Beni"
    if lat >= -17.65 and lng <= -66.95:
        return "La Paz"
    if -18.55 <= lat <= -15.85 and -66.95 <= lng <= -64.30:
        return "Cochabamba"
    if -19.80 <= lat < -17.65 and lng <= -66.50:
        return "Oruro"
    if lat < -20.95 and -65.40 <= lng <= -62.20:
        return "Tarija"
    if -20.95 <= lat <= -18.55 and -65.65 <= lng <= -63.65:
        return "Chuquisaca"
    if lng >= -64.30 and lat >= -20.55:
        return "Santa Cruz"
    return "Potosí" if lng < -64.5 else "Santa Cruz"


def _parse_bbox(raw_bbox: str | None) -> tuple[float, float, float, float]:
    if not raw_bbox or not str(raw_bbox).strip():
        return BOLIVIA_BBOX
    partes = [p.strip() for p in str(raw_bbox).split(",")]
    if len(partes) != 4:
        raise ValidationError(
            "El parámetro 'bbox' debe tener formato 'west,south,east,north'"
        )
    try:
        west, south, east, north = (float(p) for p in partes)
    except ValueError as exc:
        raise ValidationError(
            "Las coordenadas de 'bbox' deben ser numéricas"
        ) from exc

    if not (-180.0 <= west < east <= 180.0) or not (-90.0 <= south < north <= 90.0):
        raise ValidationError("Rango geográfico de 'bbox' inválido")
    return (west, south, east, north)


def _normalizar_confianza(raw_conf: str | None) -> str:
    val = str(raw_conf or "").strip().lower()
    if val in ("h", "high", "alta"):
        return "ALTA"
    if val in ("n", "nominal", "media"):
        return "NOMINAL"
    if val in ("l", "low", "baja"):
        return "BAJA"
    try:
        num = float(val)
    except ValueError:
        return "NOMINAL"
    if num >= 80:
        return "ALTA"
    if num >= 40:
        return "NOMINAL"
    return "BAJA"


def _parse_acq_datetime(
    acq_date: str | None, acq_time: str | None
) -> tuple[str | None, str | None]:
    fecha = str(acq_date or "").strip()
    hora_raw = str(acq_time or "").strip().zfill(4)
    if not fecha:
        return None, None
    try:
        hh = int(hora_raw[:2])
        mm = int(hora_raw[2:4])
        dt_utc = datetime.strptime(fecha, "%Y-%m-%d").replace(
            hour=hh, minute=mm, tzinfo=timezone.utc
        )
        dt_bo = dt_utc.astimezone(TZ_BOLIVIA)
        return dt_utc.isoformat(), dt_bo.strftime("%Y-%m-%d %H:%M (BOT)")
    except ValueError:
        return None, fecha


def parsear_csv_firms(
    csv_text: str, sensor_default: str = DEFAULT_SENSOR
) -> list[dict[str, Any]]:
    """Convierte el CSV devuelto por NASA FIRMS en diccionarios normalizados."""
    limpio = (csv_text or "").strip()
    if not limpio:
        return []
    primera_linea = limpio.splitlines()[0].lower()
    if "latitude" not in primera_linea or "longitude" not in primera_linea:
        raise ValueError(f"Respuesta inesperada de NASA FIRMS: {limpio[:140]}")

    reader = csv.DictReader(io.StringIO(limpio))
    puntos: list[dict[str, Any]] = []

    for idx, row in enumerate(reader, start=1):
        try:
            lat = round(float(row.get("latitude", "")), 5)
            lng = round(float(row.get("longitude", "")), 5)
        except (TypeError, ValueError):
            continue

        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            continue

        kelvin_raw = row.get("bright_ti4") or row.get("brightness")
        temp_c: float | None = None
        if kelvin_raw not in (None, ""):
            try:
                temp_c = round(float(kelvin_raw) - 273.15, 1)
            except ValueError:
                temp_c = None

        frp_mw = 0.0
        if row.get("frp") not in (None, ""):
            try:
                frp_mw = round(float(row["frp"]), 2)
            except ValueError:
                frp_mw = 0.0

        confianza = _normalizar_confianza(row.get("confidence"))
        iso_utc, local_txt = _parse_acq_datetime(row.get("acq_date"), row.get("acq_time"))
        daynight_raw = str(row.get("daynight") or "").strip().upper()
        pasada = "NOCTURNA" if daynight_raw == "N" else "DIURNA"

        scan = row.get("scan")
        track = row.get("track")
        pixel_km = None
        if scan and track:
            try:
                pixel_km = f"{float(scan):.2f}×{float(track):.2f} km"
            except ValueError:
                pixel_km = None

        sat = (row.get("satellite") or "").strip()
        inst = (row.get("instrument") or sensor_default.split("_")[0]).strip()
        id_foco = f"firms-{idx}-{lat:.4f}-{lng:.4f}"

        puntos.append(
            {
                "id_foco": id_foco,
                "lat": lat,
                "lng": lng,
                "coordenadas": {"lat": lat, "lng": lng},
                "departamento": _estimar_departamento_bolivia(lat, lng),
                "temperatura_brillo_c": temp_c,
                "frp_mw": frp_mw,
                "confianza": confianza,
                "fecha_hora_utc": iso_utc,
                "fecha_hora_local": local_txt,
                "satelite": sat or "NOAA-20",
                "instrumento": inst or "VIIRS",
                "sensor": sensor_default,
                "pasada": pasada,
                "resolucion_pixel": pixel_km or "0.38×0.38 km",
                "es_simulado": False,
            }
        )

    return puntos


def _generar_pasada_simulada(sensor: str) -> list[dict[str, Any]]:
    """Genera anomalías térmicas VIIRS de demostración distribuidas en Bolivia."""
    ahora_utc = datetime.now(timezone.utc)
    muestras = [
        {
            "offset_min": 28,
            "lat": -17.3138,
            "lng": -66.1836,
            "temp_c": 94.6,
            "frp_mw": 34.8,
            "confianza": "ALTA",
            "pasada": "DIURNA",
        },
        {
            "offset_min": 31,
            "lat": -17.2110,
            "lng": -66.2945,
            "temp_c": 112.3,
            "frp_mw": 58.2,
            "confianza": "ALTA",
            "pasada": "DIURNA",
        },
        {
            "offset_min": 47,
            "lat": -17.8450,
            "lng": -60.7540,
            "temp_c": 76.4,
            "frp_mw": 28.5,
            "confianza": "NOMINAL",
            "pasada": "DIURNA",
        },
        {
            "offset_min": 52,
            "lat": -14.8340,
            "lng": -64.9020,
            "temp_c": 88.2,
            "frp_mw": 41.6,
            "confianza": "ALTA",
            "pasada": "DIURNA",
        },
    ]

    puntos: list[dict[str, Any]] = []
    for idx, m in enumerate(muestras, start=1):
        dt_u = ahora_utc - timedelta(minutes=m["offset_min"])
        dt_bo = dt_u.astimezone(TZ_BOLIVIA)
        puntos.append(
            {
                "id_foco": f"sim-{idx}-{m['lat']:.4f}-{m['lng']:.4f}",
                "lat": m["lat"],
                "lng": m["lng"],
                "coordenadas": {"lat": m["lat"], "lng": m["lng"]},
                "departamento": _estimar_departamento_bolivia(m["lat"], m["lng"]),
                "temperatura_brillo_c": m["temp_c"],
                "frp_mw": m["frp_mw"],
                "confianza": m["confianza"],
                "fecha_hora_utc": dt_u.isoformat(),
                "fecha_hora_local": dt_bo.strftime("%Y-%m-%d %H:%M (BOT)"),
                "satelite": "NOAA-20 (Simulado)",
                "instrumento": "VIIRS",
                "sensor": sensor,
                "pasada": m["pasada"],
                "resolucion_pixel": "0.38×0.38 km",
                "es_simulado": True,
            }
        )
    return puntos


class FirmsService:
    """Consulta anomalías térmicas NASA FIRMS y las cruza con entidades locales."""

    def __init__(self, map_key: str | None = None, timeout_sec: float = 6.0) -> None:
        self._explicit_key = map_key
        self._timeout = timeout_sec

    def _obtener_map_key(self) -> str:
        if self._explicit_key is not None:
            return self._explicit_key.strip().strip('"')
        if "NASA_FIRMS_MAP_KEY" not in os.environ:
            load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
        return os.environ.get("NASA_FIRMS_MAP_KEY", "").strip().strip('"')

    def _descargar_csv(
        self,
        map_key: str,
        sensor: str,
        bbox: tuple[float, float, float, float],
        days: int,
    ) -> str:
        bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
        url = f"{FIRMS_BASE_URL}/{map_key}/{sensor}/{bbox_str}/{days}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "VigiaTerritorial-CAD/1.0"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")

    def _enriquecer_con_contexto_local(
        self, puntos_base: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        zonas_db = ZonaRiesgoRef.query.all()
        zonas_geo: list[tuple[ZonaRiesgoRef, dict[str, float], list[dict[str, float]]]] = []
        for z in zonas_db:
            if (getattr(z, "estado", None) or "Activa") == "Inactiva":
                continue
            coords_z, poly_z = extraer_geometria_zona(z)
            if coords_z:
                zonas_geo.append((z, coords_z, poly_z))

        avisos_db = AvisoIncendio.query.filter(
            AvisoIncendio.estado_aviso.in_(("PENDIENTE", "VERIFICADO"))
        ).all()
        avisos_geo: list[tuple[AvisoIncendio, dict[str, float]]] = []
        for a in avisos_db:
            coords_a = extract_coordinates(a.ubicacion)
            if coords_a:
                avisos_geo.append((a, coords_a))

        zonas_por_id = {z.id_zona: c for z, c, _ in zonas_geo}
        incidentes_db = Incidente.query.filter(Incidente.estado != "CERRADO").all()
        incidentes_geo: list[tuple[Incidente, dict[str, float]]] = []
        for inc in incidentes_db:
            coords_i = extract_coordinates(inc.ubicacion)
            if coords_i is None and inc.id_zona in zonas_por_id:
                coords_i = zonas_por_id[inc.id_zona]
            if coords_i:
                incidentes_geo.append((inc, coords_i))

        enriquecidos: list[dict[str, Any]] = []
        for base in puntos_base:
            lat = base["lat"]
            lng = base["lng"]

            mejor_zona = None
            for z, cz, poly_z in zonas_geo:
                if poly_z and punto_en_poligono(lat, lng, poly_z):
                    d = 0.0
                else:
                    if abs(lat - cz["lat"]) > 0.16 or abs(lng - cz["lng"]) > 0.16:
                        continue
                    d = round(haversine_km(lat, lng, cz["lat"], cz["lng"]), 2)
                if d <= RADIO_ZONA_KM and (
                    mejor_zona is None or d < mejor_zona["distancia_km"]
                ):
                    mejor_zona = {
                        "id_zona": z.id_zona,
                        "nombre": z.nombre,
                        "nivel_riesgo": z.nivel_riesgo,
                        "estado_zona": getattr(z, "estado", None) or "Activa",
                        "distancia_km": d,
                    }

            mejor_inc = None
            for inc, ci in incidentes_geo:
                if abs(lat - ci["lat"]) > 0.035 or abs(lng - ci["lng"]) > 0.035:
                    continue
                d = round(haversine_km(lat, lng, ci["lat"], ci["lng"]), 2)
                if d <= RADIO_CORRELACION_KM and (
                    mejor_inc is None or d < mejor_inc["distancia_km"]
                ):
                    mejor_inc = {
                        "id_incidente": inc.id_incidente,
                        "ubicacion": inc.ubicacion,
                        "estado": inc.estado,
                        "gravedad": inc.gravedad,
                        "distancia_km": d,
                    }

            mejor_aviso = None
            for av, ca in avisos_geo:
                if abs(lat - ca["lat"]) > 0.035 or abs(lng - ca["lng"]) > 0.035:
                    continue
                d = round(haversine_km(lat, lng, ca["lat"], ca["lng"]), 2)
                if d <= RADIO_CORRELACION_KM and (
                    mejor_aviso is None or d < mejor_aviso["distancia_km"]
                ):
                    mejor_aviso = {
                        "id_aviso": av.id_aviso,
                        "ubicacion": av.ubicacion,
                        "estado_aviso": av.estado_aviso,
                        "nivel_urgencia": av.nivel_urgencia,
                        "distancia_km": d,
                    }

            if mejor_inc is not None:
                correlacion = "INCIDENTE_ACTIVO"
            elif mejor_aviso is not None:
                correlacion = "AVISO_EN_TRIAGE"
            else:
                correlacion = "FOCO_NO_REPORTADO"

            frp = base["frp_mw"]
            conf = base["confianza"]
            riesgo_zona = mejor_zona["nivel_riesgo"] if mejor_zona else None
            en_zona_critica = (
                mejor_zona is not None
                and mejor_zona["distancia_km"] <= 5.0
                and riesgo_zona in ("EXTREMO", "ALTO")
            )

            if conf == "ALTA" and (frp >= 45.0 or en_zona_critica):
                urgencia_sug = "CRITICO"
            elif conf in ("ALTA", "NOMINAL") and frp >= 15.0:
                urgencia_sug = "ALTO"
            elif conf == "NOMINAL" or frp >= 5.0:
                urgencia_sug = "MEDIO"
            else:
                urgencia_sug = "BAJO"

            enriquecidos.append(
                {
                    **base,
                    "zona_cercana": mejor_zona,
                    "incidente_cercano": mejor_inc,
                    "aviso_cercano": mejor_aviso,
                    "correlacion": correlacion,
                    "nivel_urgencia_sugerido": urgencia_sug,
                }
            )

        enriquecidos.sort(
            key=lambda f: (
                0 if f["correlacion"] == "FOCO_NO_REPORTADO" else 1,
                0 if f["confianza"] == "ALTA" else 1,
                -(f["frp_mw"] or 0.0),
            )
        )
        return enriquecidos

    def consultar_focos(
        self,
        sensor: str | None = None,
        days: int = 1,
        bbox_raw: str | None = None,
        simulado: bool = False,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        sensor_sel = (sensor or DEFAULT_SENSOR).strip().upper()
        if sensor_sel not in SENSORES_SOPORTADOS:
            raise ValidationError(
                f"Sensor '{sensor_sel}' no soportado. Opciones: {', '.join(SENSORES_SOPORTADOS)}"
            )
        if not isinstance(days, int) or not (1 <= days <= 5):
            raise ValidationError("El parámetro 'days' debe ser un entero entre 1 y 5")

        es_bbox_nacional = not (bbox_raw and str(bbox_raw).strip())
        bbox = _parse_bbox(bbox_raw)
        map_key = self._obtener_map_key()
        ahora_iso = datetime.now(timezone.utc).isoformat()

        if simulado:
            focos = self._enriquecer_con_contexto_local(
                _generar_pasada_simulada(sensor_sel)
            )
            return self._armar_respuesta(
                focos=focos,
                estado_fuente="simulacion",
                configurado=bool(map_key),
                es_simulado=True,
                sensor=sensor_sel,
                days=days,
                bbox=bbox,
                consultado_en=ahora_iso,
                mensaje="Mostrando pasada satelital demostrativa sobre Bolivia con correlación real en base de datos.",
            )

        if not map_key:
            return self._armar_respuesta(
                focos=[],
                estado_fuente="sin_clave",
                configurado=False,
                es_simulado=False,
                sensor=sensor_sel,
                days=days,
                bbox=bbox,
                consultado_en=ahora_iso,
                mensaje=(
                    "Configura NASA_FIRMS_MAP_KEY en backend/.env para consultar NASA FIRMS en tiempo real, "
                    "o activa la pasada demostrativa en el mapa."
                ),
            )

        alcance_prefijo = "BO:" if es_bbox_nacional else ""
        cache_key = f"{alcance_prefijo}{sensor_sel}:{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}:{days}"
        ventana_txt = "5 días" if days == 5 else f"últimas {days * 24}h"
        alcance_txt = f"en Bolivia ({ventana_txt})" if es_bbox_nacional else f"en {ventana_txt}"
        ahora_mono = time.monotonic()
        cached = _FIRMS_CACHE.get(cache_key)

        if not force_refresh and cached is not None:
            ts_guardado, raw_guardados, iso_guardado = cached
            if (ahora_mono - ts_guardado) < CACHE_TTL_SECONDS:
                focos_cache = self._enriquecer_con_contexto_local(raw_guardados)
                return self._armar_respuesta(
                    focos=focos_cache,
                    estado_fuente="cache",
                    configurado=True,
                    es_simulado=False,
                    sensor=sensor_sel,
                    days=days,
                    bbox=bbox,
                    consultado_en=iso_guardado,
                    mensaje=(
                        f"Datos satelitales NASA FIRMS ({sensor_sel}) desde caché activa: "
                        f"{len(focos_cache)} foco(s) {alcance_txt}."
                    ),
                )

        try:
            csv_text = self._descargar_csv(map_key, sensor_sel, bbox, days)
            puntos_base = parsear_csv_firms(csv_text, sensor_default=sensor_sel)
            if es_bbox_nacional:
                puntos_base = [
                    p for p in puntos_base if _punto_en_bolivia(p["lat"], p["lng"])
                ]
            _FIRMS_CACHE[cache_key] = (ahora_mono, puntos_base, ahora_iso)
            focos = self._enriquecer_con_contexto_local(puntos_base)
            return self._armar_respuesta(
                focos=focos,
                estado_fuente="en_vivo",
                configurado=True,
                es_simulado=False,
                sensor=sensor_sel,
                days=days,
                bbox=bbox,
                consultado_en=ahora_iso,
                mensaje=(
                    f"Consulta en vivo a NASA FIRMS ({sensor_sel}) completada: "
                    f"{len(focos)} foco(s) {alcance_txt}."
                ),
            )
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            if cached is not None:
                _, raw_previos, iso_previo = cached
                focos_prev = self._enriquecer_con_contexto_local(raw_previos)
                return self._armar_respuesta(
                    focos=focos_prev,
                    estado_fuente="cache",
                    configurado=True,
                    es_simulado=False,
                    sensor=sensor_sel,
                    days=days,
                    bbox=bbox,
                    consultado_en=iso_previo,
                    mensaje=f"NASA FIRMS sin respuesta temporal ({exc}); mostrando última lectura disponible.",
                )
            return self._armar_respuesta(
                focos=[],
                estado_fuente="error_red",
                configurado=True,
                es_simulado=False,
                sensor=sensor_sel,
                days=days,
                bbox=bbox,
                consultado_en=ahora_iso,
                mensaje=f"No se pudo conectar con NASA FIRMS ({exc}).",
            )

    @staticmethod
    def _armar_respuesta(
        *,
        focos: list[dict[str, Any]],
        estado_fuente: str,
        configurado: bool,
        es_simulado: bool,
        sensor: str,
        days: int,
        bbox: tuple[float, float, float, float],
        consultado_en: str,
        mensaje: str,
    ) -> dict[str, Any]:
        return {
            "estado_fuente": estado_fuente,
            "configurado": configurado,
            "es_simulado": es_simulado,
            "sensor": sensor,
            "days": days,
            "bbox": list(bbox),
            "consultado_en": consultado_en,
            "cache_ttl_seg": CACHE_TTL_SECONDS,
            "mensaje": mensaje,
            "resumen": {
                "total_focos": len(focos),
                "sin_reporte": sum(
                    1 for f in focos if f["correlacion"] == "FOCO_NO_REPORTADO"
                ),
                "confirmando_avisos": sum(
                    1 for f in focos if f["correlacion"] == "AVISO_EN_TRIAGE"
                ),
                "en_incidentes_activos": sum(
                    1 for f in focos if f["correlacion"] == "INCIDENTE_ACTIVO"
                ),
                "confianza_alta": sum(
                    1 for f in focos if f["confianza"] == "ALTA"
                ),
            },
            "focos": focos,
        }
