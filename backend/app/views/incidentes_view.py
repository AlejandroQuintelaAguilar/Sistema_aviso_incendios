"""Serializadores (capa Vista) para las entidades del módulo de Incidentes."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.models.aviso_incendio import AvisoIncendio
from app.models.evaluacion_dano import EvaluacionDano
from app.models.incidente import Incidente
from app.models.incidente_brigada import IncidenteBrigada
from app.models.informe_bombero import InformeBombero
from app.utils.geo_utils import extract_coordinates


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _elapsed_minutes(
    start_dt: datetime | None, end_dt: datetime | None = None
) -> int | None:
    if start_dt is None:
        return None
    start_utc = _ensure_utc(start_dt)
    end_utc = _ensure_utc(end_dt) if end_dt else datetime.now(timezone.utc)
    minutes = int((end_utc - start_utc).total_seconds() // 60)
    return max(0, minutes)


def serialize_aviso(aviso: AvisoIncendio) -> dict[str, Any]:
    """Serializa un AvisoIncendio a diccionario JSON-safe."""
    tiempo_min = _elapsed_minutes(aviso.fecha_hora)
    alerta_sla = (
        aviso.estado_aviso == "PENDIENTE"
        and tiempo_min is not None
        and tiempo_min >= 15
    )
    return {
        "id_aviso": aviso.id_aviso,
        "id_ciudadano": aviso.id_ciudadano,
        "fecha_hora": _iso(aviso.fecha_hora),
        "ubicacion": aviso.ubicacion,
        "coordenadas": extract_coordinates(aviso.ubicacion),
        "descripcion": aviso.descripcion,
        "nivel_urgencia": aviso.nivel_urgencia,
        "foto": aviso.foto,
        "estado_aviso": aviso.estado_aviso,
        "tiempo_transcurrido_min": tiempo_min,
        "alerta_sla": alerta_sla,
        "created_at": _iso(aviso.created_at),
    }


def serialize_incidente(incidente: Incidente) -> dict[str, Any]:
    """Serializa un Incidente a diccionario JSON-safe."""
    return {
        "id_incidente": incidente.id_incidente,
        "id_aviso": incidente.id_aviso,
        "id_operador": incidente.id_operador,
        "id_zona": incidente.id_zona,
        "fecha_inicio": _iso(incidente.fecha_inicio),
        "ubicacion": incidente.ubicacion,
        "coordenadas": extract_coordinates(incidente.ubicacion),
        "gravedad": incidente.gravedad,
        "estado": incidente.estado,
        "fecha_cierre": _iso(incidente.fecha_cierre),
        "duracion_min": _elapsed_minutes(incidente.fecha_inicio, incidente.fecha_cierre),
        "created_at": _iso(incidente.created_at),
        "updated_at": _iso(incidente.updated_at),
    }


def serialize_incidente_brigada(asignacion: IncidenteBrigada) -> dict[str, Any]:
    """Serializa una asignación de brigada a diccionario JSON-safe."""
    return {
        "id_incidente": asignacion.id_incidente,
        "id_brigada": asignacion.id_brigada,
        "fecha_asignacion": _iso(asignacion.fecha_asignacion),
        "estado_asignacion": asignacion.estado_asignacion,
    }


def serialize_informe_bombero(informe: InformeBombero) -> dict[str, Any]:
    """Serializa un InformeBombero a diccionario JSON-safe."""
    return {
        "id_informe": informe.id_informe,
        "id_incidente": informe.id_incidente,
        "id_bombero": informe.id_bombero,
        "fecha_hora": _iso(informe.fecha_hora),
        "acciones": informe.acciones,
        "observaciones": informe.observaciones,
        "evidencia": informe.evidencia,
        "created_at": _iso(informe.created_at),
    }


def serialize_evaluacion_dano(evaluacion: EvaluacionDano) -> dict[str, Any]:
    """Serializa una EvaluacionDano a diccionario JSON-safe."""
    costo = evaluacion.costo_estimado
    return {
        "id_evaluacion": evaluacion.id_evaluacion,
        "id_incidente": evaluacion.id_incidente,
        "tipo_dano": evaluacion.tipo_dano,
        "nivel_dano": evaluacion.nivel_dano,
        "descripcion": evaluacion.descripcion,
        "costo_estimado": float(costo) if isinstance(costo, Decimal) else costo,
        "fecha_evaluacion": _iso(evaluacion.fecha_evaluacion),
    }
