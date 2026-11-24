"""Endpoint de verificación de estado del servicio y base de datos."""

from flask import Blueprint
from sqlalchemy import text

from app.config.database import db
from app.views.response_view import error_response, success_response

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.get("/health")
def health_check():
    """Verifica que Flask y la conexión a la base de datos respondan."""
    try:
        db.session.execute(text("SELECT 1"))
        return success_response(
            data={"status": "ok", "database": "connected"},
            message="Servicio operativo",
        )
    except Exception as exc:
        return error_response(
            message="Base de datos no disponible",
            status_code=503,
            details=str(exc),
        )
