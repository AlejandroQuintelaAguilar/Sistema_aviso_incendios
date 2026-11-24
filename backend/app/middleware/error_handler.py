"""Excepciones de dominio y manejadores globales de error."""

from flask import Flask
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.views.response_view import error_response


class AppError(Exception):
    """Excepción base para errores controlados de la aplicación."""

    status_code = 400

    def __init__(self, message: str, status_code: int | None = None, details=None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.details = details


class ValidationError(AppError):
    """Error de validación de datos de entrada."""

    status_code = 400


class NotFoundError(AppError):
    """Recurso no encontrado."""

    status_code = 404


class ConflictError(AppError):
    """Conflicto de estado o restricción de negocio."""

    status_code = 409


def register_error_handlers(app: Flask) -> None:
    """Registra manejadores globales en la instancia Flask."""

    @app.errorhandler(AppError)
    def handle_app_error(err: AppError):
        return error_response(err.message, status_code=err.status_code, details=err.details)

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(err: IntegrityError):
        return error_response(
            "Violación de integridad en base de datos",
            status_code=409,
            details=str(err.orig) if err.orig else str(err),
        )

    @app.errorhandler(SQLAlchemyError)
    def handle_sqlalchemy_error(err: SQLAlchemyError):
        return error_response(
            "Error al consultar o persistir datos",
            status_code=500,
            details=str(err),
        )
