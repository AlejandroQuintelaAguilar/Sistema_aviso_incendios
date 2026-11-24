"""Modelo SQLAlchemy para la tabla incidentes."""

from datetime import datetime, timezone
from app.config.database import db

GRAVEDADES_INCIDENTE = ("BAJA", "MEDIA", "ALTA", "CATASTROFICA")
ESTADOS_INCIDENTE = ("ACTIVO", "CONTROLADO", "EXTINGUIDO", "CERRADO")


class Incidente(db.Model):
    """Entidad central del módulo de gestión de incidentes."""

    __tablename__ = "incidentes"

    id_incidente = db.Column(db.Integer, primary_key=True)
    id_aviso = db.Column(
        db.Integer,
        db.ForeignKey("avisos_incendio.id_aviso", ondelete="SET NULL"),
        nullable=True,
    )
    id_operador = db.Column(
        db.Integer,
        db.ForeignKey("personas.id_persona", ondelete="SET NULL"),
        nullable=True,
    )
    id_zona = db.Column(
        db.Integer,
        db.ForeignKey("zonas_riesgo.id_zona", ondelete="SET NULL"),
        nullable=True,
    )
    fecha_inicio = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    ubicacion = db.Column(db.Text, nullable=False)
    gravedad = db.Column(db.String(20), nullable=False, default="MEDIA")
    estado = db.Column(db.String(30), nullable=False, default="ACTIVO")
    fecha_cierre = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
