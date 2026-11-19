"""Blueprint de recursos: se registra con prefijo /api/recursos."""

from flask import Blueprint

from app.controllers import estaciones_controller, recursos_controller
from app.middleware.auth import rol_requerido

recursos_bp = Blueprint("recursos", __name__)

LECTORES = ("ADMINISTRADOR", "OPERADOR", "BOMBERO")


@recursos_bp.get("/consultar")
@rol_requerido(*LECTORES)
def consultar():
    return estaciones_controller.ctrlCUConsultar()


@recursos_bp.post("/")
@rol_requerido("ADMINISTRADOR")
def registrar():
    return recursos_controller.ctrlCURegistrarUnidadRecurso()


@recursos_bp.patch("/<tipo>/<int:id_registro>/estado")
@rol_requerido(*LECTORES)
def cambiar_estado(tipo, id_registro):
    return recursos_controller.ctrlCUActualizarEstado(tipo, id_registro)
