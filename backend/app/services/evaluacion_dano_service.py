"""Servicio de negocio para evaluaciones de daños (relación 1:1 por incidente)."""

from decimal import Decimal, InvalidOperation
from typing import Any

from app.config.database import db
from app.middleware.error_handler import ConflictError, NotFoundError, ValidationError
from app.models.evaluacion_dano import NIVELES_DANO, EvaluacionDano
from app.models.incidente import Incidente
from app.utils.validators import require_non_empty_str, validate_enum


def _parse_costo(value: Any) -> Decimal:
    if value is None:
        return Decimal("0.00")
    try:
        costo = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError("El campo 'costo_estimado' debe ser numérico") from exc
    if costo < 0:
        raise ValidationError("El campo 'costo_estimado' no puede ser negativo")
    return costo


class EvaluacionDanoService:
    """Gestiona la evaluación de daños asociada a cada incidente."""

    def _asegurar_incidente(self, id_incidente: int) -> Incidente:
        incidente = db.session.get(Incidente, id_incidente)
        if incidente is None:
            raise NotFoundError(f"Incidente con id {id_incidente} no encontrado")
        return incidente

    def obtener_por_incidente(self, id_incidente: int) -> EvaluacionDano:
        self._asegurar_incidente(id_incidente)
        evaluacion = EvaluacionDano.query.filter_by(id_incidente=id_incidente).first()
        if evaluacion is None:
            raise NotFoundError(
                f"El incidente {id_incidente} aún no tiene evaluación de daños"
            )
        return evaluacion

    def upsert_en_sesion(
        self, id_incidente: int, data: dict[str, Any]
    ) -> EvaluacionDano:
        """Crea o actualiza la evaluación de daños sin hacer commit (para transacciones compuestas)."""
        existente = EvaluacionDano.query.filter_by(id_incidente=id_incidente).first()
        if existente is None:
            tipo_dano = require_non_empty_str(data, "tipo_dano")
            nivel_dano = validate_enum(data.get("nivel_dano"), NIVELES_DANO, "nivel_dano")
            costo = _parse_costo(data.get("costo_estimado"))
            evaluacion = EvaluacionDano(
                id_incidente=id_incidente,
                tipo_dano=tipo_dano,
                nivel_dano=nivel_dano,
                descripcion=data.get("descripcion"),
                costo_estimado=costo,
            )
            db.session.add(evaluacion)
            return evaluacion

        if "tipo_dano" in data:
            existente.tipo_dano = require_non_empty_str(data, "tipo_dano")
        if "nivel_dano" in data:
            existente.nivel_dano = validate_enum(
                data["nivel_dano"], NIVELES_DANO, "nivel_dano"
            )
        if "descripcion" in data:
            existente.descripcion = data["descripcion"]
        if "costo_estimado" in data:
            existente.costo_estimado = _parse_costo(data["costo_estimado"])
        return existente

    def crear_evaluacion(
        self, id_incidente: int, data: dict[str, Any]
    ) -> EvaluacionDano:
        incidente = self._asegurar_incidente(id_incidente)
        if incidente.estado == "CERRADO":
            raise ConflictError(
                "No se puede registrar la evaluación de daños de un incidente CERRADO"
            )

        existente = EvaluacionDano.query.filter_by(id_incidente=id_incidente).first()
        if existente is not None:
            raise ConflictError(
                f"El incidente {id_incidente} ya cuenta con una evaluación de daños"
            )

        evaluacion = self.upsert_en_sesion(id_incidente, data)
        db.session.commit()
        return evaluacion

    def actualizar_evaluacion(
        self, id_incidente: int, data: dict[str, Any]
    ) -> EvaluacionDano:
        incidente = self._asegurar_incidente(id_incidente)
        if incidente.estado == "CERRADO":
            raise ConflictError(
                "No se puede modificar la evaluación de daños de un incidente CERRADO"
            )
        self.obtener_por_incidente(id_incidente)
        evaluacion = self.upsert_en_sesion(id_incidente, data)
        db.session.commit()
        return evaluacion
