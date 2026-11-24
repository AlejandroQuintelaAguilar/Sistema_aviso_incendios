"""Puerto e implementación de validación y lectura de referencias externas (DIP / LSP).

Permite verificar FKs hacia tablas de otras iteraciones (personas, zonas_riesgo,
brigadas) y obtener resúmenes mínimos para UI sin acoplar lógica ni CRUDs de esos módulos.
"""

from typing import Any, Protocol

from app.config.database import db
from app.middleware.error_handler import ConflictError, NotFoundError
from app.models.estacion import Estacion
from app.models.incidente_brigada import IncidenteBrigada
from app.models.referencias import (
    AlertaPreventivaRef,
    BrigadaMiembroRef,
    BrigadaRef,
    InspeccionRef,
    PersonaRef,
    ZonaRiesgoRef,
)
from app.utils.geo_utils import extract_coordinates, haversine_km


def extraer_geometria_zona(
    zona: ZonaRiesgoRef,
) -> tuple[dict[str, float] | None, list[dict[str, float]]]:
    """Obtiene el centroide/punto GPS y el polígono cartográfico de una zona."""
    raw_coords = getattr(zona, "coordenadas", None)
    puntos: list[dict[str, float]] = []
    if isinstance(raw_coords, list):
        for p in raw_coords:
            if not isinstance(p, dict):
                continue
            try:
                lat = round(float(p["lat"]), 5)
                lng = round(float(p["lng"]), 5)
            except (KeyError, TypeError, ValueError):
                continue
            if -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0:
                puntos.append({"lat": lat, "lng": lng})

    if len(puntos) >= 3:
        centroide = {
            "lat": round(sum(p["lat"] for p in puntos) / len(puntos), 5),
            "lng": round(sum(p["lng"] for p in puntos) / len(puntos), 5),
        }
        return centroide, puntos
    if len(puntos) >= 1:
        return puntos[0], []
    return extract_coordinates(getattr(zona, "ubicacion", "")), []


def punto_en_poligono(
    lat: float, lng: float, poligono: list[dict[str, float]]
) -> bool:
    """Evalúa mediante ray-casting si una coordenada cae dentro del polígono de la zona."""
    if not poligono or len(poligono) < 3:
        return False
    inside = False
    n = len(poligono)
    j = n - 1
    for i in range(n):
        yi = poligono[i]["lat"]
        xi = poligono[i]["lng"]
        yj = poligono[j]["lat"]
        xj = poligono[j]["lng"]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def serializar_zona_enriquecida(
    zona: ZonaRiesgoRef,
    ultima_alerta: AlertaPreventivaRef | None = None,
    ultima_inspeccion: InspeccionRef | None = None,
) -> dict[str, Any]:
    """Serializa la zona con su geometría, clima 30-30-30, alertas COE e inspección."""
    coords, poligono = extraer_geometria_zona(zona)
    return {
        "id_zona": zona.id_zona,
        "nombre": zona.nombre,
        "ubicacion": zona.ubicacion,
        "descripcion": getattr(zona, "descripcion", None),
        "coordenadas": coords,
        "poligono": poligono,
        "nivel_riesgo": zona.nivel_riesgo,
        "estado": getattr(zona, "estado", None) or "Activa",
        "tipo_vegetacion": getattr(zona, "tipo_vegetacion", None) or "Sin especificar",
        "area_hectareas": float(getattr(zona, "area_hectareas", 0) or 0),
        "temperatura": float(getattr(zona, "temperatura", 25.0) or 25.0),
        "humedad": float(getattr(zona, "humedad", 40.0) or 40.0),
        "velocidad_viento": float(getattr(zona, "velocidad_viento", 15.0) or 15.0),
        "alerta_preventiva": (
            {
                "id_alerta": ultima_alerta.id_alerta,
                "nivel_alerta": ultima_alerta.nivel_alerta,
                "mensaje": ultima_alerta.mensaje,
                "observaciones": ultima_alerta.observaciones,
                "fecha_emision": (
                    ultima_alerta.fecha_emision.isoformat()
                    if ultima_alerta.fecha_emision
                    else None
                ),
            }
            if ultima_alerta
            else None
        ),
        "ultima_inspeccion": (
            {
                "id_inspeccion": ultima_inspeccion.id_inspeccion,
                "nivel_riesgo_observado": ultima_inspeccion.nivel_riesgo_observado,
                "observaciones": ultima_inspeccion.observaciones,
                "recomendaciones": ultima_inspeccion.recomendaciones,
                "fecha_inspeccion": (
                    ultima_inspeccion.fecha_inspeccion.isoformat()
                    if ultima_inspeccion.fecha_inspeccion
                    else None
                ),
            }
            if ultima_inspeccion
            else None
        ),
    }


class ReferenciaValidatorProtocol(Protocol):
    """Contrato para validar y consultar entidades externas."""

    def asegurar_persona(self, id_persona: int, rol_desc: str = "Persona") -> None: ...
    def asegurar_zona(self, id_zona: int) -> None: ...
    def asegurar_brigada(self, id_brigada: int) -> None: ...
    def asegurar_brigada_disponible(self, id_brigada: int) -> None: ...
    def listar_catalogos(self) -> dict[str, list[dict[str, Any]]]: ...
    def sugerir_zona_cercana(self, lat: float, lng: float) -> dict[str, Any] | None: ...


class SQLAlchemyReferenciaValidator:
    """Implementación por defecto contra las tablas SQLAlchemy de referencia."""

    def asegurar_persona(self, id_persona: int, rol_desc: str = "Persona") -> None:
        if db.session.get(PersonaRef, id_persona) is None:
            raise NotFoundError(f"{rol_desc} con id {id_persona} no existe")

    def asegurar_zona(self, id_zona: int) -> None:
        zona = db.session.get(ZonaRiesgoRef, id_zona)
        if zona is None:
            raise NotFoundError(f"Zona de riesgo con id {id_zona} no existe")
        if (getattr(zona, "estado", None) or "Activa") == "Inactiva":
            raise ConflictError(
                f"La zona de riesgo '{zona.nombre}' está Inactiva y no admite nuevos incidentes"
            )

    def asegurar_brigada(self, id_brigada: int) -> None:
        if db.session.get(BrigadaRef, id_brigada) is None:
            raise NotFoundError(f"Brigada con id {id_brigada} no existe")

    def asegurar_brigada_disponible(self, id_brigada: int) -> None:
        brigada = db.session.get(BrigadaRef, id_brigada)
        if brigada is None:
            raise NotFoundError(f"Brigada con id {id_brigada} no existe")
        if brigada.estado != "ACTIVA":
            raise ConflictError(
                f"La brigada '{brigada.nombre}' no está disponible (estado actual: {brigada.estado})"
            )

    def listar_catalogos(self) -> dict[str, list[dict[str, Any]]]:
        personas = PersonaRef.query.order_by(PersonaRef.id_persona.asc()).all()
        zonas = ZonaRiesgoRef.query.order_by(ZonaRiesgoRef.id_zona.asc()).all()
        brigadas = BrigadaRef.query.order_by(BrigadaRef.id_brigada.asc()).all()
        estaciones = Estacion.query.order_by(Estacion.id_estacion.asc()).all()
        asignaciones_activas = IncidenteBrigada.query.filter(
            IncidenteBrigada.estado_asignacion != "LIBERADA"
        ).all()
        miembros_activos = BrigadaMiembroRef.query.filter_by(estado="ACTIVO").all()
        miembros_pendientes = BrigadaMiembroRef.query.filter_by(estado="PENDIENTE").all()
        alertas_recientes = AlertaPreventivaRef.query.order_by(
            AlertaPreventivaRef.fecha_emision.desc(),
            AlertaPreventivaRef.id_alerta.desc(),
        ).all()
        inspecciones_recientes = InspeccionRef.query.order_by(
            InspeccionRef.fecha_inspeccion.desc(),
            InspeccionRef.id_inspeccion.desc(),
        ).all()

        alerta_por_zona: dict[int, AlertaPreventivaRef] = {}
        for al in alertas_recientes:
            alerta_por_zona.setdefault(al.id_zona, al)

        inspeccion_por_zona: dict[int, InspeccionRef] = {}
        for ins in inspecciones_recientes:
            inspeccion_por_zona.setdefault(ins.id_zona, ins)

        pendientes_por_brigada: dict[int, int] = {}
        for mp in miembros_pendientes:
            pendientes_por_brigada[mp.id_brigada] = (
                pendientes_por_brigada.get(mp.id_brigada, 0) + 1
            )

        personas_map = {p.id_persona: p for p in personas}
        ocupada_por_brigada = {
            a.id_brigada: a.id_incidente for a in asignaciones_activas
        }

        estaciones_geo: list[dict[str, Any]] = []
        estaciones_map: dict[int, dict[str, Any]] = {}
        for est in estaciones:
            coords = extract_coordinates(f"{est.nombre} {est.direccion}")
            est_info = {
                "id_estacion": est.id_estacion,
                "nombre": est.nombre,
                "direccion": est.direccion,
                "coordenadas": coords,
            }
            estaciones_geo.append(est_info)
            estaciones_map[est.id_estacion] = est_info

        miembros_por_brigada: dict[int, list[dict[str, Any]]] = {}
        jefe_por_brigada: dict[int, str] = {}
        jefe_id_por_brigada: dict[int, int] = {}
        for m in miembros_activos:
            persona = personas_map.get(m.id_persona)
            nombre_comp = (
                f"{persona.nombres} {persona.apellidos}"
                if persona
                else f"Bombero #{m.id_persona}"
            )
            miembros_por_brigada.setdefault(m.id_brigada, []).append(
                {
                    "id_persona": m.id_persona,
                    "nombre_completo": nombre_comp,
                    "rol_en_brigada": m.rol_en_brigada,
                }
            )
            if (
                m.rol_en_brigada == "JEFE_CUADRILLA"
                and m.id_brigada not in jefe_por_brigada
            ):
                jefe_por_brigada[m.id_brigada] = nombre_comp
                jefe_id_por_brigada[m.id_brigada] = m.id_persona

        brigadas_serializadas: list[dict[str, Any]] = []
        for b in brigadas:
            est_info = estaciones_map.get(b.id_estacion) if b.id_estacion else None
            miembros = miembros_por_brigada.get(b.id_brigada, [])
            id_inc_ocupada = ocupada_por_brigada.get(b.id_brigada)
            brigadas_serializadas.append(
                {
                    "id_brigada": b.id_brigada,
                    "nombre": b.nombre,
                    "estado": b.estado,
                    "motivo_estado": b.motivo_estado,
                    "id_estacion": b.id_estacion,
                    "estacion_nombre": est_info["nombre"] if est_info else None,
                    "estacion_direccion": est_info["direccion"] if est_info else None,
                    "estacion_coordenadas": (
                        est_info["coordenadas"] if est_info else None
                    ),
                    "disponible": b.estado == "ACTIVA" and id_inc_ocupada is None,
                    "ocupada_en_incidente": id_inc_ocupada,
                    "cantidad_miembros": len(miembros),
                    "invitaciones_pendientes": pendientes_por_brigada.get(
                        b.id_brigada, 0
                    ),
                    "jefe_cuadrilla": jefe_por_brigada.get(b.id_brigada),
                    "jefe_cuadrilla_id": jefe_id_por_brigada.get(b.id_brigada),
                    "miembros": miembros,
                }
            )

        return {
            "personas": [
                {
                    "id_persona": p.id_persona,
                    "nombre_completo": f"{p.nombres} {p.apellidos}",
                    "tipo_persona": p.tipo_persona,
                }
                for p in personas
            ],
            "zonas": [
                serializar_zona_enriquecida(
                    z,
                    ultima_alerta=alerta_por_zona.get(z.id_zona),
                    ultima_inspeccion=inspeccion_por_zona.get(z.id_zona),
                )
                for z in zonas
            ],
            "brigadas": brigadas_serializadas,
            "estaciones_geo": estaciones_geo,
        }

    def sugerir_zona_cercana(self, lat: float, lng: float) -> dict[str, Any] | None:
        """Retorna la zona activa más cercana (0 km si cae dentro del polígono)."""
        zonas = ZonaRiesgoRef.query.order_by(ZonaRiesgoRef.id_zona.asc()).all()
        mejor: dict[str, Any] | None = None
        mejor_dist: float | None = None

        for z in zonas:
            estado_z = getattr(z, "estado", None) or "Activa"
            if estado_z == "Inactiva":
                continue
            coords, poligono = extraer_geometria_zona(z)
            en_poligono = bool(poligono and punto_en_poligono(lat, lng, poligono))
            if en_poligono:
                dist = 0.0
            elif coords is not None:
                dist = haversine_km(lat, lng, coords["lat"], coords["lng"])
            else:
                continue

            if mejor_dist is None or dist < mejor_dist:
                mejor_dist = dist
                mejor = {
                    "id_zona": z.id_zona,
                    "nombre": z.nombre,
                    "nivel_riesgo": z.nivel_riesgo,
                    "estado": estado_z,
                    "coordenadas": coords,
                    "distancia_km": round(dist, 2),
                    "en_poligono": en_poligono,
                }
        return mejor
