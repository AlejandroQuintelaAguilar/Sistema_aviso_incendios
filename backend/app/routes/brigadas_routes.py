"""Blueprint de brigadas: se registra con prefijo /api/brigadas."""

from flask import Blueprint

from app.controllers import brigadas_controller
from app.middleware.auth import rol_requerido

brigadas_bp = Blueprint("brigadas", __name__)

LECTORES = ("ADMINISTRADOR", "OPERADOR", "BOMBERO")
GESTORES = ("ADMINISTRADOR", "OPERADOR")


@brigadas_bp.get("/")
@rol_requerido(*LECTORES)
def listar():
    return brigadas_controller.listar()


@brigadas_bp.get("/consultar")
@rol_requerido(*LECTORES)
def consultar():
    return brigadas_controller.consultar()


@brigadas_bp.get("/disponibles")
@rol_requerido(*LECTORES)
def disponibles():
    """Expuesto a la iteración 5: brigadas ACTIVAS sin asignación abierta."""
    return brigadas_controller.disponibles()


@brigadas_bp.get("/bomberos-disponibles")
@rol_requerido(*GESTORES)
def bomberos_disponibles():
    return brigadas_controller.bomberos_disponibles()


@brigadas_bp.get("/incendios-asignados")
@rol_requerido(*LECTORES)
def incendios_asignados():
    return brigadas_controller.incendios_asignados()


@brigadas_bp.patch("/incendios/<int:id_incidente>/brigadas/<int:id_brigada>/confirmar")
@rol_requerido("BOMBERO")
def confirmar_recepcion(id_incidente, id_brigada):
    return brigadas_controller.confirmar_recepcion(id_incidente, id_brigada)


@brigadas_bp.get("/<int:id_brigada>")
@rol_requerido(*LECTORES)
def obtener(id_brigada):
    return brigadas_controller.obtener(id_brigada)


@brigadas_bp.get("/<int:id_brigada>/miembros")
@rol_requerido(*LECTORES)
def listar_miembros(id_brigada):
    return brigadas_controller.listar_miembros(id_brigada)


@brigadas_bp.post("/")
@rol_requerido("ADMINISTRADOR")
def crear():
    return brigadas_controller.crear()


@brigadas_bp.patch("/<int:id_brigada>")
@rol_requerido("ADMINISTRADOR")
def editar(id_brigada):
    return brigadas_controller.editar(id_brigada)


@brigadas_bp.patch("/<int:id_brigada>/estado")
@rol_requerido(*LECTORES)
def cambiar_estado(id_brigada):
    return brigadas_controller.cambiar_estado(id_brigada)


@brigadas_bp.patch("/<int:id_brigada>/desactivar")
@rol_requerido("ADMINISTRADOR")
def desactivar(id_brigada):
    return brigadas_controller.desactivar(id_brigada)


@brigadas_bp.patch("/<int:id_brigada>/reactivar")
@rol_requerido("ADMINISTRADOR")
def reactivar(id_brigada):
    return brigadas_controller.reactivar(id_brigada)


@brigadas_bp.post("/<int:id_brigada>/miembros")
@rol_requerido(*GESTORES)
def asignar_miembros(id_brigada):
    return brigadas_controller.asignar_miembros(id_brigada)


@brigadas_bp.delete("/<int:id_brigada>/miembros/<int:id_persona>")
@rol_requerido(*GESTORES)
def retirar_miembro(id_brigada, id_persona):
    return brigadas_controller.retirar_miembro(id_brigada, id_persona)
