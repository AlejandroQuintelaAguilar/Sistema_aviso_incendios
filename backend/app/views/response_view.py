"""Respuestas JSON estandarizadas (capa Vista del backend)."""

from typing import Any
from flask import jsonify


def success_response(
    data: Any = None,
    message: str = "Operación exitosa",
    status_code: int = 200,
    meta: dict[str, Any] | None = None,
):
    """Construye una respuesta JSON uniforme para operaciones exitosas."""
    payload: dict[str, Any] = {
        "success": True,
        "message": message,
        "data": data,
    }
    if meta is not None:
        payload["meta"] = meta
    return jsonify(payload), status_code


def error_response(
    message: str,
    status_code: int = 400,
    details: Any = None,
):
    """Construye una respuesta JSON uniforme para errores."""
    payload: dict[str, Any] = {
        "success": False,
        "message": message,
        "error": {
            "code": status_code,
            "details": details,
        },
    }
    return jsonify(payload), status_code
