"""Modelo SQLAlchemy para la tabla informes_bombero."""

from datetime import datetime, timezone
from app.config.database import db


class InformeBombero(db.Model):
    """Bitácora de acciones y observaciones registradas por un bombero en campo."""

    __tablename__ = "informes_bombero"

    id_informe = db.Column(db.Integer, primary_key=True)
    id_incidente = db.Column(
        db.Integer,
        db.ForeignKey("incidentes.id_incidente", ondelete="CASCADE"),
        nullable=False,
    )
    id_bombero = db.Column(
        db.Integer,
        db.ForeignKey("personas.id_persona", ondelete="RESTRICT"),
        nullable=False,
    )
    fecha_hora = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    acciones = db.Column(db.Text, nullable=False)
    observaciones = db.Column(db.Text, nullable=True)
    evidencia = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
