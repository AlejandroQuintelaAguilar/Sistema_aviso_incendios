from datetime import datetime, timezone

from app.config.database import db


class Inspeccion(db.Model):
    __tablename__ = "inspecciones"

    id_inspeccion = db.Column(db.Integer, primary_key=True)
    id_zona = db.Column(db.Integer, db.ForeignKey("zonas_riesgo.id_zona", ondelete="CASCADE"), nullable=False)
    id_inspector = db.Column(db.Integer, db.ForeignKey("personas.id_persona", ondelete="RESTRICT"), nullable=False)
    fecha_inspeccion = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    nivel_riesgo_observado = db.Column(db.String(20), nullable=False)
    observaciones = db.Column(db.Text, nullable=False)
    recomendaciones = db.Column(db.Text)
    evidencia = db.Column(db.Text)

    def to_dict(self):
        return {
            "id_inspeccion": self.id_inspeccion,
            "id_zona": self.id_zona,
            "id_inspector": self.id_inspector,
            "fecha_inspeccion": self.fecha_inspeccion.isoformat() if self.fecha_inspeccion else None,
            "nivel_riesgo_observado": self.nivel_riesgo_observado,
            "observaciones": self.observaciones,
            "recomendaciones": self.recomendaciones,
            "evidencia": self.evidencia,
        }
