"""Modelo SQLAlchemy para la tabla evaluaciones_danos."""

from datetime import datetime, timezone
from app.config.database import db

NIVELES_DANO = ("LEVE", "MODERADO", "SEVERO", "TOTAL")


class EvaluacionDano(db.Model):
    """Evaluación de daños asociada 1:1 a un incidente."""

    __tablename__ = "evaluaciones_danos"

    id_evaluacion = db.Column(db.Integer, primary_key=True)
    id_incidente = db.Column(
        db.Integer,
        db.ForeignKey("incidentes.id_incidente", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    tipo_dano = db.Column(db.String(100), nullable=False)
    nivel_dano = db.Column(db.String(20), nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    costo_estimado = db.Column(db.Numeric(14, 2), default=0.00)
    fecha_evaluacion = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
