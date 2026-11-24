"""
Servicio de logica de negocio para Zonas de Riesgo.
Incluye calculo meteorologico (Regla 30-30-30), filtros geoespaciales y resolucion de links de mapas.
"""

import re
import urllib.request
from urllib.parse import parse_qs, unquote, urlparse
from app.models.zona_riesgo import ZonaRiesgo, FocoCalorSatelital, AlertaPreventiva
from app.models.solicitud_zona import SolicitudZona
from app.config.database import db
from app.models.historial_zona import HistorialZona

# ---------------------------------------------------------------------------
# CU08: Calculo dinamico del nivel de riesgo (Regla 30-30-30)
# ---------------------------------------------------------------------------

def calcular_nivel_riesgo(temperatura, humedad, velocidad_viento):
    """
    Regla 30-30-30:
      - Temperatura > 30 C  => incrementa riesgo
      - Humedad < 30 %      => incrementa riesgo
      - Viento > 30 km/h   => incrementa riesgo
    Retorna: 'BAJO', 'MEDIO', 'ALTO' o 'EXTREMO'
    """
    puntos = 0
    if temperatura and float(temperatura) > 30:
        puntos += 1
    if humedad and float(humedad) < 30:
        puntos += 1
    if velocidad_viento and float(velocidad_viento) > 30:
        puntos += 1

    mapa = {0: "BAJO", 1: "MEDIO", 2: "ALTO", 3: "EXTREMO"}
    return mapa[puntos]


def recalcular_nivel_zona(zona):
    """Aplica la regla 30-30-30 sobre los datos climaticos de la zona."""
    return calcular_nivel_riesgo(zona.temperatura, zona.humedad, zona.velocidad_viento)


# ---------------------------------------------------------------------------
# Resolucion de enlaces de Google Maps a coordenadas GPS
# ---------------------------------------------------------------------------

def resolver_link_ubicacion(texto):
    """
    Detecta si en 'texto' hay un enlace de Google Maps (maps.app.goo.gl o google.com/maps)
    o un par de coordenadas lat, lng, y retorna dict con lat, lng si las encuentra.
    """
    if not texto:
        return None

    def validar_par(latitud, longitud):
        try:
            latitud, longitud = float(latitud), float(longitud)
        except (TypeError, ValueError):
            return None
        if not (-90 <= latitud <= 90 and -180 <= longitud <= 180):
            return None
        return {"lat": latitud, "lng": longitud}

    def extraer(url):
        url = unquote(url)
        # Pin del mapa: @lat,lng; y parámetros habituales de búsqueda o destino.
        match = re.search(r'@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)', url)
        if match:
            par = validar_par(*match.groups())
            if par:
                return par
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        for clave in ("q", "query", "ll", "center", "destination", "daddr"):
            for valor in query.get(clave, []):
                match = re.search(r'(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)', valor)
                if match:
                    par = validar_par(*match.groups())
                    if par:
                        return par
        # Formato de enlaces compartidos de Maps: !3dLAT!4dLNG.
        match = re.search(r'!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)', url)
        if match:
            par = validar_par(*match.groups())
            if par:
                return par
        # También aparece como !2dLNG!3dLAT.
        match = re.search(r'!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)', url)
        if match:
            par = validar_par(match.group(2), match.group(1))
            if par:
                return par
        return None

    # Aceptar coordenadas pegadas directamente, incluso sin decimales.
    directo = re.search(r'(?<![\d.])(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)(?![\d.])', texto)
    if directo:
        par = validar_par(*directo.groups())
        if par:
            return {**par, "fuente": "coordenadas_directas"}

    url_match = re.search(r'https?://[^\s<>]+', texto)
    if not url_match:
        return None
    url = url_match.group(0).rstrip(".,)")
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    hosts_google_maps = host == "maps.app.goo.gl" or host == "goo.gl" or host == "maps.google.com" or host == "google.com" or host.endswith(".google.com")
    if not hosts_google_maps:
        return None
    if host == "goo.gl" and not parsed.path.startswith("/maps"):
        return None

    par = extraer(url)
    url_final = url
    if not par and host in {"maps.app.goo.gl", "goo.gl"}:
        try:
            class RedireccionesSoloGoogleMaps(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, req, fp, code, msg, headers, newurl):
                    destino = urlparse(newurl)
                    dominio = (destino.hostname or "").lower()
                    if not (dominio == "maps.app.goo.gl" or dominio == "goo.gl" or dominio == "maps.google.com" or dominio == "google.com" or dominio.endswith(".google.com")):
                        raise ValueError("El enlace redirige fuera de Google Maps")
                    return super().redirect_request(req, fp, code, msg, headers, newurl)

            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            opener = urllib.request.build_opener(RedireccionesSoloGoogleMaps)
            with opener.open(req, timeout=5) as resp:
                url_final = resp.geturl()
            par = extraer(url_final)
        except Exception:
            return None
    return {**par, "url_final": url_final, "fuente": "google_maps_enlace"} if par else None


# ---------------------------------------------------------------------------
# CU07: Listado con datos geoespaciales
# ---------------------------------------------------------------------------

def listar_zonas(nivel_riesgo=None, estado=None):
    """Retorna todas las zonas con conteo de incidentes vinculados."""
    query = ZonaRiesgo.query

    if nivel_riesgo:
        query = query.filter(ZonaRiesgo.nivel_riesgo == nivel_riesgo.upper())
    if estado:
        query = query.filter(ZonaRiesgo.estado == estado)

    zonas = query.order_by(ZonaRiesgo.created_at.desc()).all()
    return [z.to_dict() for z in zonas]


def obtener_zona(id_zona):
    """Retorna una zona por ID o None si no existe."""
    return ZonaRiesgo.query.get(id_zona)


# ---------------------------------------------------------------------------
# CU03: Crear zona con poligono cartografico
# ---------------------------------------------------------------------------

def crear_zona(payload):
    """
    Crea una nueva zona de riesgo con coordenadas GPS.
    El nivel_riesgo puede ser calculado automaticamente si no se indica.
    """
    _validar_payload_zona(payload, requiere_ubicacion_gps=True)

    temperatura = payload.get("temperatura", 25.0)
    humedad = payload.get("humedad", 40.0)
    velocidad_viento = payload.get("velocidad_viento", 15.0)

    nivel = payload.get("nivel_riesgo") or calcular_nivel_riesgo(temperatura, humedad, velocidad_viento)

    zona = ZonaRiesgo(
        nombre=payload["nombre"].strip(),
        ubicacion=payload["ubicacion"].strip(),
        nivel_riesgo=nivel.upper(),
        descripcion=(payload.get("descripcion") or "").strip(),
        id_administrador=payload.get("id_administrador"),
        coordenadas=payload.get("coordenadas", []),
        tipo_vegetacion=payload.get("tipo_vegetacion", "Pastizal seco"),
        area_hectareas=payload.get("area_hectareas", 0.0),
        estado=payload.get("estado", "Activa"),
        temperatura=temperatura,
        humedad=humedad,
        velocidad_viento=velocidad_viento,
    )

    db.session.add(zona)
    db.session.commit()
    return zona


def actualizar_zona(id_zona, payload):
    """Actualiza campos de una zona existente, recalcula nivel si cambian datos climaticos."""
    if not isinstance(payload, dict):
        raise ValueError("Los cambios deben enviarse como un objeto JSON")
    zona = ZonaRiesgo.query.get(id_zona)
    if not zona:
        return None

    for campo in ("nombre", "ubicacion", "descripcion", "tipo_vegetacion"):
        if campo in payload:
            valor = payload[campo]
            if not isinstance(valor, str) or (campo in ("nombre", "ubicacion") and not valor.strip()):
                raise ValueError(f"El campo '{campo}' debe contener texto válido")
    if "nivel_riesgo" in payload:
        nivel = payload["nivel_riesgo"]
        if not isinstance(nivel, str) or nivel.upper() not in ZonaRiesgo.NIVELES_VALIDOS:
            raise ValueError(f"nivel_riesgo invalido. Valores: {ZonaRiesgo.NIVELES_VALIDOS}")

    if "coordenadas" in payload:
        _validar_coordenadas(payload["coordenadas"], requiere=True)

    campos_editables = [
    "nombre", "ubicacion", "descripcion",
    "coordenadas", "tipo_vegetacion", "area_hectareas",
    "temperatura", "humedad", "velocidad_viento",
]
    for campo in campos_editables:
        if campo in payload:
            setattr(zona, campo, payload[campo])

    # Recalcular nivel si se aportan datos climaticos
    if any(k in payload for k in ("temperatura", "humedad", "velocidad_viento")):
        zona.nivel_riesgo = recalcular_nivel_zona(zona)
    elif "nivel_riesgo" in payload:
        zona.nivel_riesgo = payload["nivel_riesgo"].upper()

    db.session.commit()
    return zona


def eliminar_zona(id_zona):
    """Elimina una zona y sus registros de historial dependientes."""
    zona = ZonaRiesgo.query.get(id_zona)
    if not zona:
        return False

    # El historial tiene una FK restrictiva y pertenece a la zona eliminada.
    HistorialZona.query.filter_by(id_zona=id_zona).delete(synchronize_session=False)
    # Mantener las solicitudes aprobadas aunque se elimine la zona que generaron.
    SolicitudZona.query.filter_by(id_zona=id_zona).update(
        {SolicitudZona.id_zona: None}, synchronize_session=False
    )
    db.session.delete(zona)
    db.session.commit()
    return True


# ---------------------------------------------------------------------------
# CU09: Focos de calor satelitales
# ---------------------------------------------------------------------------

def listar_focos_calor(horas=24):
    """Retorna focos detectados en las ultimas N horas."""
    from datetime import datetime, timezone, timedelta
    limite = datetime.now(timezone.utc) - timedelta(hours=horas)
    focos = FocoCalorSatelital.query.filter(
        FocoCalorSatelital.fecha_deteccion >= limite
    ).order_by(FocoCalorSatelital.fecha_deteccion.desc()).all()
    return [f.to_dict() for f in focos]


# ---------------------------------------------------------------------------
# CU10: Emitir alerta preventiva COE
# ---------------------------------------------------------------------------

def emitir_alerta_coe(id_zona, payload):
    """
    Registra una alerta preventiva y actualiza el estado de la zona.
    Solo se permite si nivel_riesgo es ALTO o EXTREMO.
    """
    zona = ZonaRiesgo.query.get(id_zona)
    if not zona:
        return None, "Zona no encontrada"

    if zona.nivel_riesgo not in ("ALTO", "EXTREMO"):
        return None, "Solo se pueden emitir alertas para zonas de nivel ALTO o EXTREMO"

    nivel_alerta = payload.get("nivel_alerta", "Roja")
    if nivel_alerta not in AlertaPreventiva.NIVELES_VALIDOS:
        return None, f"nivel_alerta debe ser uno de: {AlertaPreventiva.NIVELES_VALIDOS}"

    alerta = AlertaPreventiva(
        id_zona=id_zona,
        nivel_alerta=nivel_alerta,
        mensaje=payload.get("mensaje", f"Alerta preventiva emitida para zona {zona.nombre}"),
        observaciones=payload.get("observaciones", ""),
        emitido_por=payload.get("emitido_por"),
    )

    zona.estado = "Alerta Emitida"

    db.session.add(alerta)
    db.session.commit()
    return alerta, None


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _validar_payload_zona(payload, requiere_ubicacion_gps=False):
    if not isinstance(payload, dict):
        raise ValueError("Los datos de la zona deben enviarse como un objeto JSON")
    for campo in ("nombre", "ubicacion"):
        valor = payload.get(campo)
        if not isinstance(valor, str) or not valor.strip():
            raise ValueError(f"El campo '{campo}' es obligatorio")
    for campo in ("descripcion", "tipo_vegetacion"):
        if campo in payload and payload[campo] is not None and not isinstance(payload[campo], str):
            raise ValueError(f"El campo '{campo}' debe ser texto")

    _validar_coordenadas(payload.get("coordenadas", []), requiere=requiere_ubicacion_gps)

    nivel = payload.get("nivel_riesgo")
    if nivel and (not isinstance(nivel, str) or nivel.upper() not in ZonaRiesgo.NIVELES_VALIDOS):
        raise ValueError(f"nivel_riesgo invalido. Valores: {ZonaRiesgo.NIVELES_VALIDOS}")


def _validar_coordenadas(coordenadas, requiere=False):
    if not isinstance(coordenadas, list):
        raise ValueError("coordenadas debe ser una lista JSON")
    if not coordenadas:
        if requiere:
            raise ValueError("Registra una ubicación GPS o un polígono de al menos 3 puntos")
        return
    if len(coordenadas) == 2 or (len(coordenadas) > 1 and len(coordenadas) < 3):
        raise ValueError("Registra un punto GPS o un polígono con al menos 3 puntos")
    for punto in coordenadas:
        try:
            lat = float(punto["lat"])
            lng = float(punto["lng"])
        except (TypeError, KeyError, ValueError):
            raise ValueError("Cada punto debe tener latitud y longitud numéricas")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError("Hay coordenadas GPS fuera de rango")


# ---------------------------------------------------------------------------
# Comparativa: superficie quemada por departamento y anio
# ---------------------------------------------------------------------------

def obtener_superficie_quemada():
    """Retorna hectareas por departamento y anio, con porcentajes y totales."""
    from app.models.zona_riesgo import SuperficieQuemada

    registros = SuperficieQuemada.query.order_by(SuperficieQuemada.anio).all()
    anios = sorted({r.anio for r in registros})
    totales = {a: 0 for a in anios}
    por_dep = {}
    for r in registros:
        ha = int(r.hectareas)
        por_dep.setdefault(r.departamento, {})[r.anio] = ha
        totales[r.anio] += ha

    departamentos = []
    for dep, vals in por_dep.items():
        departamentos.append({
            "departamento": dep,
            "valores": {a: vals.get(a, 0) for a in anios},
            "porcentajes": {
                a: round(vals.get(a, 0) * 100 / totales[a]) if totales[a] else 0 for a in anios
            },
        })
    # Orden por superficie del ultimo anio con mayor acumulado
    departamentos.sort(key=lambda d: sum(d["valores"].values()), reverse=True)
    return {"anios": anios, "departamentos": departamentos, "totales": totales}


def cambiar_estado_zona(id_zona, nuevo_estado, motivo, id_usuario):
    """Cambia el estado y registra su historial en una transaccion."""

    zona = db.session.get(ZonaRiesgo, id_zona)

    if zona is None:
        raise ValueError("La zona de riesgo no existe")

    if nuevo_estado not in ("Activa", "Inactiva"):
        raise ValueError("El estado debe ser Activa o Inactiva")

    if zona.estado == "Alerta Emitida":
        raise ValueError(
            "La zona tiene una alerta emitida. "
            "Debe resolverse antes de cambiar su estado."
        )

    if zona.estado == nuevo_estado:
        raise ValueError("La zona ya tiene ese estado")

    if not isinstance(motivo, str) or not motivo.strip():
        raise ValueError("Debe ingresar el motivo del cambio")

    estado_anterior = zona.estado

    historial = HistorialZona(
        id_zona=id_zona,
        id_usuario=id_usuario,
        estado_anterior=estado_anterior,
        estado_nuevo=nuevo_estado,
        motivo=motivo.strip()
    )

    try:
        zona.estado = nuevo_estado
        db.session.add(historial)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return zona, historial


def obtener_historial_zona(id_zona):
    """Consulta los cambios de estado de una zona."""

    zona = db.session.get(ZonaRiesgo, id_zona)

    if zona is None:
        return None

    registros = (
        HistorialZona.query
        .filter_by(id_zona=id_zona)
        .order_by(HistorialZona.fecha_cambio.desc())
        .all()
    )

    return [registro.to_dict() for registro in registros]
