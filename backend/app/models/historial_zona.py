from datetime import datetime, timezone
from app.config.database import db


class HistorialZona(db.Model):
    __tablename__ = "historial_estado_zona"

    id_historial = db.Column(db.Integer, primary_key=True)

    id_zona = db.Column(
        db.Integer,
        db.ForeignKey("zonas_riesgo.id_zona"),
        nullable=False
    )

    id_usuario = db.Column(db.Integer, nullable=False)

    estado_anterior = db.Column(db.String(20), nullable=False)
    estado_nuevo = db.Column(db.String(20), nullable=False)

    motivo = db.Column(db.Text, nullable=False)

    fecha_cambio = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    def to_dict(self):
        return {
            "id_historial": self.id_historial,
            "id_zona": self.id_zona,
            "id_usuario": self.id_usuario,
            "estado_anterior": self.estado_anterior,
            "estado_nuevo": self.estado_nuevo,
            "motivo": self.motivo,
            "fecha_cambio": self.fecha_cambio.isoformat()
        }