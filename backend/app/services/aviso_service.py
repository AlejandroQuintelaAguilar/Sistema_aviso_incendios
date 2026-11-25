"""Servicio de negocio para avisos de incendio (SRP / OCP / DIP)."""

from typing import Any

from app.config.database import db
from app.middleware.error_handler import ConflictError, NotFoundError, ValidationError
from app.models.aviso_incendio import (
    ESTADOS_AVISO,
    NIVELES_URGENCIA,
    AvisoIncendio,
)
from app.models.incidente import GRAVEDADES_INCIDENTE, Incidente
from app.services.referencias_service import (
    ReferenciaValidatorProtocol,
    SQLAlchemyReferenciaValidator,
)
from app.utils.geo_utils import (
    extract_coordinates,
    format_ubicacion_con_coordenadas,
    haversine_km,
    reverse_geocode_ubicacion,
    validate_coordinates,
)
from app.utils.validators import (
    require_non_empty_str,
    validate_enum,
    validate_optional_int,
)
from app.views.incidentes_view import serialize_aviso, serialize_incidente

PESO_URGENCIA: dict[str, int] = {
    "BAJO": 1,
    "MEDIO": 2,
    "ALTO": 3,
    "CRITICO": 4,
}

MAPA_URGENCIA_GRAVEDAD: dict[str, str] = {
    "BAJO": "BAJA",
    "MEDIO": "MEDIA",
    "ALTO": "ALTA",
    "CRITICO": "CATASTROFICA",
}

TRANSICIONES_AVISO: dict[str, set[str]] = {
    "PENDIENTE": {"VERIFICADO", "DESCARTADO", "ATENDIDO"},
    "VERIFICADO": {"ATENDIDO", "DESCARTADO"},
    "DESCARTADO": set(),
    "ATENDIDO": set(),
}


class AvisoService:
    """Gestiona el ciclo de vida de los avisos ciudadanos de incendio."""

    def __init__(
        self,
        referencias: ReferenciaValidatorProtocol | None = None,
    ) -> None:
        self._referencias = referencias or SQLAlchemyReferenciaValidator()

    def crear_aviso(self, data: dict[str, Any]) -> AvisoIncendio:
        raw_ubicacion = data.get("ubicacion")
        lat = data.get("lat")
        lng = data.get("lng")

        if isinstance(raw_ubicacion, str) and raw_ubicacion.strip():
            ubicacion_base = raw_ubicacion.strip()
        elif lat is not None and lng is not None:
            lat_f, lng_f = validate_coordinates(lat, lng)
            direccion_real = reverse_geocode_ubicacion(lat_f, lng_f)
            sugerida = self._referencias.sugerir_zona_cercana(lat_f, lng_f)

            if direccion_real and sugerida is not None and sugerida["distancia_km"] <= 10.0:
                if sugerida["nombre"].lower() in direccion_real.lower():
                    ubicacion_base = direccion_real
                else:
                    ubicacion_base = f"{direccion_real} — {sugerida['nombre']}"
            elif direccion_real:
                ubicacion_base = direccion_real
            elif sugerida is not None and sugerida["distancia_km"] <= 25.0:
                ubicacion_base = f"Sector {sugerida['nombre']}"
            else:
                ubicacion_base = "Reporte GPS Ciudadano"
        else:
            ubicacion_base = require_non_empty_str(data, "ubicacion")

        ubicacion = format_ubicacion_con_coordenadas(ubicacion_base, lat, lng)
        id_ciudadano = validate_optional_int(data, "id_ciudadano")
        if id_ciudadano is not None:
            self._referencias.asegurar_persona(id_ciudadano, "Ciudadano")

        nivel_urgencia = data.get("nivel_urgencia", "MEDIO")
        validate_enum(nivel_urgencia, NIVELES_URGENCIA, "nivel_urgencia")

        aviso = AvisoIncendio(
            id_ciudadano=id_ciudadano,
            ubicacion=ubicacion,
            descripcion=data.get("descripcion"),
            nivel_urgencia=nivel_urgencia,
            foto=data.get("foto"),
            estado_aviso="PENDIENTE",
        )
        db.session.add(aviso)
        db.session.commit()
        return aviso

    def listar_avisos(
        self,
        estado_aviso: str | None = None,
        nivel_urgencia: str | None = None,
        q: str | None = None,
    ) -> list[AvisoIncendio]:
        query = AvisoIncendio.query
        if estado_aviso:
            validate_enum(estado_aviso, ESTADOS_AVISO, "estado_aviso")
            query = query.filter_by(estado_aviso=estado_aviso)
        if nivel_urgencia:
            validate_enum(nivel_urgencia, NIVELES_URGENCIA, "nivel_urgencia")
            query = query.filter_by(nivel_urgencia=nivel_urgencia)
        if isinstance(q, str) and q.strip():
            termino = q.strip()
            patron = f"%{termino}%"
            condiciones = [
                AvisoIncendio.ubicacion.ilike(patron),
                AvisoIncendio.descripcion.ilike(patron),
            ]
            clean_id = termino.lstrip("#")
            if clean_id.isdigit():
                condiciones.append(AvisoIncendio.id_aviso == int(clean_id))
            query = query.filter(db.or_(*condiciones))
        return query.order_by(AvisoIncendio.id_aviso.desc()).all()

    def listar_por_ciudadano(
        self, id_ciudadano: int, limite: int = 25
    ) -> list[AvisoIncendio]:
        return (
            AvisoIncendio.query.filter_by(id_ciudadano=id_ciudadano)
            .order_by(AvisoIncendio.id_aviso.desc())
            .limit(limite)
            .all()
        )

    def obtener_aviso(self, id_aviso: int) -> AvisoIncendio:
        aviso = db.session.get(AvisoIncendio, id_aviso)
        if aviso is None:
            raise NotFoundError(f"Aviso de incendio con id {id_aviso} no encontrado")
        return aviso

    def cambiar_estado(
        self, id_aviso: int, nuevo_estado: str, motivo: str | None = None
    ) -> AvisoIncendio:
        validate_enum(nuevo_estado, ESTADOS_AVISO, "estado_aviso")
        aviso = self.obtener_aviso(id_aviso)

        if aviso.estado_aviso == nuevo_estado:
            return aviso

        permitidos = TRANSICIONES_AVISO.get(aviso.estado_aviso, set())
        if nuevo_estado not in permitidos:
            raise ConflictError(
                f"No se puede cambiar un aviso de '{aviso.estado_aviso}' a '{nuevo_estado}'"
            )

        motivo_limpio = motivo.strip() if isinstance(motivo, str) else ""
        if motivo_limpio:
            etiqueta = None
            if nuevo_estado == "DESCARTADO":
                etiqueta = f"[Motivo de descarte: {motivo_limpio}]"
            elif nuevo_estado == "VERIFICADO":
                etiqueta = f"[Verificación CAD: {motivo_limpio}]"
            if etiqueta:
                actual = (aviso.descripcion or "").strip()
                if etiqueta not in actual:
                    aviso.descripcion = (
                        f"{actual}\n• {etiqueta}" if actual else etiqueta
                    )

        aviso.estado_aviso = nuevo_estado
        db.session.commit()
        return aviso

    def actualizar_descripcion(
        self,
        id_aviso: int,
        descripcion: str | None = None,
        nivel_urgencia: str | None = None,
        append: bool = True,
        foto: str | None = None,
    ) -> AvisoIncendio:
        aviso = self.obtener_aviso(id_aviso)
        if aviso.estado_aviso == "DESCARTADO":
            raise ConflictError(
                "No se puede actualizar la descripción de un aviso descartado"
            )

        texto = descripcion.strip() if isinstance(descripcion, str) else ""
        foto_limpia = foto.strip() if isinstance(foto, str) else ""
        if not texto and not foto_limpia:
            raise ValidationError(
                "Debes enviar una descripción o una fotografía del incendio"
            )

        if texto:
            actual = (aviso.descripcion or "").strip()
            generico = "Alerta SOS enviada en 1 toque sin sesión"
            if append and actual and actual != generico:
                aviso.descripcion = f"{actual}\n• {texto}"
            else:
                aviso.descripcion = texto

        if foto_limpia:
            aviso.foto = foto_limpia

        if nivel_urgencia:
            validate_enum(nivel_urgencia, NIVELES_URGENCIA, "nivel_urgencia")
            aviso.nivel_urgencia = nivel_urgencia

        db.session.commit()
        return aviso

    def detectar_cercanos(
        self, lat: float, lng: float, radio_km: float = 3.0
    ) -> list[dict[str, Any]]:
        """Detecta avisos no descartados dentro de un radio geográfico dado."""
        avisos = (
            AvisoIncendio.query.filter(AvisoIncendio.estado_aviso != "DESCARTADO")
            .order_by(AvisoIncendio.id_aviso.desc())
            .all()
        )
        cercanos: list[dict[str, Any]] = []
        for aviso in avisos:
            coords = extract_coordinates(aviso.ubicacion)
            if coords is None:
                continue
            dist = haversine_km(lat, lng, coords["lat"], coords["lng"])
            if dist <= radio_km:
                item = serialize_aviso(aviso)
                item["distancia_km"] = round(dist, 2)
                cercanos.append(item)

        cercanos.sort(key=lambda x: x["distancia_km"])
        return cercanos

    def agrupar_y_triangular(
        self, radio_km: float = 2.5, min_avisos: int = 2
    ) -> list[dict[str, Any]]:
        """Agrupa avisos activos cercanos y triangula su centroide ponderado."""
        avisos = (
            AvisoIncendio.query.filter(
                AvisoIncendio.estado_aviso.in_(("PENDIENTE", "VERIFICADO"))
            )
            .order_by(AvisoIncendio.id_aviso.desc())
            .all()
        )
        nodos: list[tuple[AvisoIncendio, dict[str, float]]] = []
        for av in avisos:
            coords = extract_coordinates(av.ubicacion)
            if coords is not None:
                nodos.append((av, coords))

        visitados: set[int] = set()
        grupos: list[dict[str, Any]] = []
        idx_grupo = 1

        for i, (av_i, c_i) in enumerate(nodos):
            if i in visitados:
                continue
            cola = [i]
            visitados.add(i)
            miembros_idx: list[int] = []

            while cola:
                actual = cola.pop(0)
                miembros_idx.append(actual)
                _, c_act = nodos[actual]
                for j, (_, c_j) in enumerate(nodos):
                    if j in visitados:
                        continue
                    if (
                        haversine_km(
                            c_act["lat"], c_act["lng"], c_j["lat"], c_j["lng"]
                        )
                        <= radio_km
                    ):
                        visitados.add(j)
                        cola.append(j)

            if len(miembros_idx) < min_avisos:
                continue

            miembros = [nodos[k] for k in miembros_idx]
            peso_total = 0.0
            suma_lat = 0.0
            suma_lng = 0.0
            urgencia_max = "BAJO"

            for av_m, c_m in miembros:
                peso = float(PESO_URGENCIA.get(av_m.nivel_urgencia, 2))
                peso_total += peso
                suma_lat += c_m["lat"] * peso
                suma_lng += c_m["lng"] * peso
                if PESO_URGENCIA.get(av_m.nivel_urgencia, 0) > PESO_URGENCIA.get(
                    urgencia_max, 0
                ):
                    urgencia_max = av_m.nivel_urgencia

            lat_c = round(suma_lat / peso_total, 4)
            lng_c = round(suma_lng / peso_total, 4)

            radio_disp = max(
                haversine_km(lat_c, lng_c, c_m["lat"], c_m["lng"])
                for _, c_m in miembros
            )
            zona_sug = self._referencias.sugerir_zona_cercana(lat_c, lng_c)

            grupos.append(
                {
                    "id_grupo": idx_grupo,
                    "cantidad_avisos": len(miembros),
                    "centroide": {"lat": lat_c, "lng": lng_c},
                    "radio_dispersion_km": round(radio_disp, 2),
                    "nivel_urgencia_max": urgencia_max,
                    "gravedad_sugerida": MAPA_URGENCIA_GRAVEDAD.get(
                        urgencia_max, "ALTA"
                    ),
                    "zona_sugerida": zona_sug,
                    "puntos": [
                        {
                            "id_aviso": av_m.id_aviso,
                            "lat": c_m["lat"],
                            "lng": c_m["lng"],
                        }
                        for av_m, c_m in miembros
                    ],
                    "ids_avisos": [av_m.id_aviso for av_m, _ in miembros],
                    "avisos": [serialize_aviso(av_m) for av_m, _ in miembros],
                }
            )
            idx_grupo += 1

        grupos.sort(key=lambda g: g["cantidad_avisos"], reverse=True)
        return grupos

    def consolidar_grupo_en_incidente(self, data: dict[str, Any]) -> dict[str, Any]:
        """Triangula un conjunto de avisos cercanos y abre un único incidente consolidado."""
        ids_raw = data.get("ids_avisos")
        if not isinstance(ids_raw, list) or len(ids_raw) == 0:
            raise ValidationError(
                "Se requiere una lista no vacía en 'ids_avisos' para consolidar"
            )

        ids_unicos: list[int] = []
        for item in ids_raw:
            try:
                val = int(item)
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    "Todos los elementos de 'ids_avisos' deben ser enteros"
                ) from exc
            if val not in ids_unicos:
                ids_unicos.append(val)

        avisos = [self.obtener_aviso(id_av) for id_av in ids_unicos]
        for av in avisos:
            if av.estado_aviso == "DESCARTADO":
                raise ConflictError(
                    f"El aviso #{av.id_aviso} está DESCARTADO y no puede agruparse"
                )

        peso_total = 0.0
        suma_lat = 0.0
        suma_lng = 0.0
        urgencia_max = "BAJO"
        con_coords = 0

        for av in avisos:
            if PESO_URGENCIA.get(av.nivel_urgencia, 0) > PESO_URGENCIA.get(
                urgencia_max, 0
            ):
                urgencia_max = av.nivel_urgencia
            coords = extract_coordinates(av.ubicacion)
            if coords is not None:
                peso = float(PESO_URGENCIA.get(av.nivel_urgencia, 2))
                peso_total += peso
                suma_lat += coords["lat"] * peso
                suma_lng += coords["lng"] * peso
                con_coords += 1

        id_zona = validate_optional_int(data, "id_zona")
        nombre_sector = "Sector Consolidado"
        lat_c: float | None = None
        lng_c: float | None = None

        if con_coords > 0 and peso_total > 0:
            lat_c = round(suma_lat / peso_total, 4)
            lng_c = round(suma_lng / peso_total, 4)
            sugerida = self._referencias.sugerir_zona_cercana(lat_c, lng_c)
            if sugerida is not None and sugerida["distancia_km"] <= 25.0:
                nombre_sector = sugerida["nombre"]
                if id_zona is None:
                    id_zona = sugerida["id_zona"]

        if id_zona is not None:
            self._referencias.asegurar_zona(id_zona)

        id_operador = validate_optional_int(data, "id_operador")
        if id_operador is not None:
            self._referencias.asegurar_persona(id_operador, "Operador")

        gravedad = data.get("gravedad") or MAPA_URGENCIA_GRAVEDAD.get(
            urgencia_max, "ALTA"
        )
        validate_enum(gravedad, GRAVEDADES_INCIDENTE, "gravedad")

        ubicacion_base = (
            data.get("ubicacion")
            or f"Zona Triangulada ({len(avisos)} alarmas) — {nombre_sector}"
        )
        ubicacion_final = format_ubicacion_con_coordenadas(
            ubicacion_base, lat_c, lng_c
        )

        aviso_principal_id: int | None = None
        for av in avisos:
            existente = Incidente.query.filter_by(id_aviso=av.id_aviso).first()
            if existente is None:
                aviso_principal_id = av.id_aviso
                break

        incidente = Incidente(
            id_aviso=aviso_principal_id,
            id_operador=id_operador,
            id_zona=id_zona,
            ubicacion=ubicacion_final,
            gravedad=gravedad,
            estado="ACTIVO",
        )
        db.session.add(incidente)
        db.session.flush()

        nota_grupo = (
            f"[Agrupado por triangulación ({len(avisos)} alarmas) "
            f"en Incidente #{incidente.id_incidente}]"
        )
        for av in avisos:
            av.estado_aviso = "ATENDIDO"
            actual = (av.descripcion or "").strip()
            if nota_grupo not in actual:
                av.descripcion = f"{actual}\n• {nota_grupo}".strip() if actual else nota_grupo

        db.session.commit()
        return {
            "incidente": serialize_incidente(incidente),
            "avisos_consolidados": len(avisos),
            "ids_avisos": ids_unicos,
            "centroide": (
                {"lat": lat_c, "lng": lng_c}
                if lat_c is not None and lng_c is not None
                else None
            ),
        }
