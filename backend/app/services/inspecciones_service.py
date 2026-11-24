from app.config.database import db
from app.models.inspeccion import Inspeccion
from app.models.zona_riesgo import ZonaRiesgo

NIVELES = {"BAJO", "MEDIO", "ALTO", "EXTREMO"}


def registrar_inspeccion(id_inspector, data):
    if not isinstance(data, dict):
        raise ValueError("La inspección debe enviarse como un objeto JSON")
    zona = db.session.get(ZonaRiesgo, data.get("id_zona"))
    if zona is None:
        raise ValueError("La zona no existe")
    nivel = (data.get("nivel_riesgo_observado") or "").upper()
    if nivel not in NIVELES:
        raise ValueError("Nivel de riesgo no válido")
    observaciones = str(data.get("observaciones") or "").strip()
    if not observaciones:
        raise ValueError("Las observaciones son obligatorias")
    inspeccion = Inspeccion(
        id_zona=zona.id_zona,
        id_inspector=id_inspector,
        nivel_riesgo_observado=nivel,
        observaciones=observaciones,
        recomendaciones=(data.get("recomendaciones") or "").strip() or None,
        evidencia=data.get("evidencia"),
    )
    db.session.add(inspeccion)
    db.session.commit()
    return inspeccion


def listar_por_zona(id_zona):
    return Inspeccion.query.filter_by(id_zona=id_zona).order_by(Inspeccion.fecha_inspeccion.desc()).all()
