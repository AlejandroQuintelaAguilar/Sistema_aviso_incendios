"""Helpers de validación reutilizables para payloads JSON."""

from typing import Any, Iterable
from app.middleware.error_handler import ValidationError


def require_non_empty_str(data: dict[str, Any], field: str) -> str:
    """Valida que un campo exista y sea un string no vacío."""
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"El campo '{field}' es obligatorio y no puede estar vacío")
    return value.strip()


def validate_enum(value: Any, allowed: Iterable[str], field: str) -> str:
    """Valida que un valor pertenezca al conjunto permitido."""
    allowed_tuple = tuple(allowed)
    if not isinstance(value, str) or value not in allowed_tuple:
        raise ValidationError(
            f"Valor inválido para '{field}'. Valores permitidos: {', '.join(allowed_tuple)}"
        )
    return value


def validate_optional_int(data: dict[str, Any], field: str) -> int | None:
    """Valida un entero positivo opcional en el payload."""
    value = data.get(field)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValidationError(f"El campo '{field}' debe ser un entero positivo")
    return value


def require_positive_int(data: dict[str, Any], field: str) -> int:
    """Valida un entero positivo obligatorio en el payload."""
    value = validate_optional_int(data, field)
    if value is None:
        raise ValidationError(f"El campo '{field}' es obligatorio")
    return value
