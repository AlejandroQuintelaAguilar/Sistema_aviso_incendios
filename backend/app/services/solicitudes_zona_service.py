from datetime import datetime, timezone

from app.config.database import db
from app.models.solicitud_zona import SolicitudZona
from app.models.zona_riesgo import ZonaRiesgo

NIVELES = {"BAJO", "MEDIO", "ALTO", "EXTREMO"}


def crear_solicitud(id_ciudadano, data):
    if not isinstance(data, dict):
        raise ValueError("La solicitud debe enviarse como un objeto JSON")
    for campo in ("nombre", "descripcion", "ubicacion"):
        if not str(data.get(campo) or "").strip():
            raise ValueError(f"El campo '{campo}' es obligatorio")
    nivel = (data.get("nivel_riesgo_sugerido") or "").upper() or None
    if nivel and nivel not in NIVELES:
        raise ValueError("Nivel de riesgo no válido")
    try:
        lat = float(data["latitud"]) if data.get("latitud") not in (None, "") else None
        lng = float(data["longitud"]) if data.get("longitud") not in (None, "") else None
    except (TypeError, ValueError):
        raise ValueError("Coordenadas no válidas")
    if lat is None or lng is None:
        raise ValueError("La solicitud necesita latitud y longitud GPS para registrar la zona")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("Coordenadas fuera de rango")
    solicitud = SolicitudZona(
        id_ciudadano=id_ciudadano,
        nombre=data["nombre"].strip(),
        descripcion=data["descripcion"].strip(),
        ubicacion=data["ubicacion"].strip(),
        coordenadas=([{"lat": lat, "lng": lng}] if lat is not None else []),
        tipo_vegetacion=(data.get("tipo_vegetacion") or "Sin especificar").strip(),
        area_hectareas=data.get("area_hectareas") or 0,
        temperatura=data.get("temperatura") or 25,
        humedad=data.get("humedad") or 40,
        velocidad_viento=data.get("velocidad_viento") or 15,
        latitud=lat,
        longitud=lng,
        nivel_riesgo_sugerido=nivel,
        evidencia=data.get("evidencia"),
    )
    db.session.add(solicitud)
    db.session.commit()
    return solicitud


def listar_solicitudes(id_ciudadano=None, pendientes=False):
    query = SolicitudZona.query
    if id_ciudadano is not None:
        query = query.filter_by(id_ciudadano=id_ciudadano)
    if pendientes:
        query = query.filter_by(estado="PENDIENTE")
    return query.order_by(SolicitudZona.fecha_solicitud.desc()).all()


def evaluar_solicitud(id_solicitud, id_evaluador, estado, observacion=""):
    estado = (estado or "").upper()
    if estado not in {"APROBADA", "RECHAZADA"}:
        raise ValueError("La evaluación debe ser APROBADA o RECHAZADA")
    solicitud = db.session.get(SolicitudZona, id_solicitud)
    if solicitud is None:
        return None
    if solicitud.estado != "PENDIENTE":
        raise ValueError("Esta solicitud ya fue evaluada")
    if estado == "RECHAZADA" and not str(observacion).strip():
        raise ValueError("Indica el motivo del rechazo")
    zona = None
    try:
        if estado == "APROBADA":
            nivel = solicitud.nivel_riesgo_sugerido or "MEDIO"
            coordenadas = []
            if solicitud.latitud is not None and solicitud.longitud is not None:
                coordenadas = [{"lat": float(solicitud.latitud), "lng": float(solicitud.longitud)}]
            zona = ZonaRiesgo(
                nombre=solicitud.nombre,
                descripcion=solicitud.descripcion,
                ubicacion=solicitud.ubicacion,
                nivel_riesgo=nivel,
                id_administrador=id_evaluador,
                coordenadas=coordenadas,
            )
            db.session.add(zona)
            db.session.flush()
            solicitud.id_zona = zona.id_zona
        solicitud.estado = estado
        solicitud.id_evaluador = id_evaluador
        solicitud.observacion_admin = (observacion or "").strip() or None
        solicitud.fecha_evaluacion = datetime.now(timezone.utc)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return solicitud
