"""Modelo SQLAlchemy para la tabla avisos_incendio."""

from datetime import datetime, timezone
from app.config.database import db

NIVELES_URGENCIA = ("BAJO", "MEDIO", "ALTO", "CRITICO")
ESTADOS_AVISO = ("PENDIENTE", "VERIFICADO", "DESCARTADO", "ATENDIDO")


class AvisoIncendio(db.Model):
    """Representa un aviso ciudadano de posible incendio."""

    __tablename__ = "avisos_incendio"

    id_aviso = db.Column(db.Integer, primary_key=True)
    id_ciudadano = db.Column(
        db.Integer,
        db.ForeignKey("personas.id_persona", ondelete="SET NULL"),
        nullable=True,
    )
    fecha_hora = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    ubicacion = db.Column(db.Text, nullable=False)
    descripcion = db.Column(db.Text, nullable=True)
    nivel_urgencia = db.Column(db.String(20), nullable=False, default="MEDIO")
    foto = db.Column(db.Text, nullable=True)
    estado_aviso = db.Column(db.String(30), nullable=False, default="PENDIENTE")
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
