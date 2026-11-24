"""Modelo SQLAlchemy para la tabla incidente_brigadas."""

from datetime import datetime, timezone
from app.config.database import db

ESTADOS_ASIGNACION_BRIGADA = ("ASIGNADA", "EN_CAMINO", "EN_SITIO", "LIBERADA")


class IncidenteBrigada(db.Model):
    """Asignación de una brigada a un incidente en una fecha determinada."""

    __tablename__ = "incidente_brigadas"

    id_incidente = db.Column(
        db.Integer,
        db.ForeignKey("incidentes.id_incidente", ondelete="CASCADE"),
        primary_key=True,
    )
    id_brigada = db.Column(
        db.Integer,
        db.ForeignKey("brigadas.id_brigada", ondelete="RESTRICT"),
        primary_key=True,
    )
    fecha_asignacion = db.Column(
        db.DateTime(timezone=True),
        primary_key=True,
        default=lambda: datetime.now(timezone.utc),
    )
    estado_asignacion = db.Column(db.String(30), default="ASIGNADA")
