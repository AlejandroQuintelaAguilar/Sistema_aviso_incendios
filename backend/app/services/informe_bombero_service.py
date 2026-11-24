"""Servicio de negocio para informes de bombero en campo."""

from typing import Any

from app.config.database import db
from app.middleware.error_handler import ConflictError, NotFoundError, ValidationError
from app.models.incidente import Incidente
from app.models.informe_bombero import InformeBombero
from app.services.evaluacion_dano_service import EvaluacionDanoService
from app.services.referencias_service import (
    ReferenciaValidatorProtocol,
    SQLAlchemyReferenciaValidator,
)
from app.utils.validators import require_non_empty_str, require_positive_int


class InformeBomberoService:
    """Gestiona la bitácora de informes de campo por incidente."""

    def __init__(
        self,
        referencias: ReferenciaValidatorProtocol | None = None,
        evaluacion_service: EvaluacionDanoService | None = None,
    ) -> None:
        self._referencias = referencias or SQLAlchemyReferenciaValidator()
        self._evaluaciones = evaluacion_service or EvaluacionDanoService()

    def _asegurar_incidente(self, id_incidente: int) -> Incidente:
        incidente = db.session.get(Incidente, id_incidente)
        if incidente is None:
            raise NotFoundError(f"Incidente con id {id_incidente} no encontrado")
        return incidente

    def listar_por_incidente(self, id_incidente: int) -> list[InformeBombero]:
        self._asegurar_incidente(id_incidente)
        return (
            InformeBombero.query.filter_by(id_incidente=id_incidente)
            .order_by(InformeBombero.fecha_hora.desc())
            .all()
        )

    def crear_informe(self, id_incidente: int, data: dict[str, Any]) -> InformeBombero:
        incidente = self._asegurar_incidente(id_incidente)
        if incidente.estado == "CERRADO":
            raise ConflictError(
                "No se pueden registrar nuevos informes en un incidente CERRADO"
            )
        id_bombero = require_positive_int(data, "id_bombero")
        self._referencias.asegurar_persona(id_bombero, "Bombero")

        acciones = require_non_empty_str(data, "acciones")

        informe = InformeBombero(
            id_incidente=id_incidente,
            id_bombero=id_bombero,
            acciones=acciones,
            observaciones=data.get("observaciones"),
            evidencia=data.get("evidencia"),
        )
        db.session.add(informe)

        evaluacion_payload = data.get("evaluacion_danos")
        if evaluacion_payload is not None:
            if not isinstance(evaluacion_payload, dict):
                raise ValidationError(
                    "El campo 'evaluacion_danos' debe ser un objeto JSON"
                )
            if evaluacion_payload:
                self._evaluaciones.upsert_en_sesion(id_incidente, evaluacion_payload)

        db.session.commit()
        return informe
