"""Blueprint de estaciones: se registra con prefijo /api/estaciones."""

from flask import Blueprint

from app.controllers import estaciones_controller
from app.middleware.auth import rol_requerido

estaciones_bp = Blueprint("estaciones", __name__)

LECTORES = ("ADMINISTRADOR", "OPERADOR", "BOMBERO")


@estaciones_bp.get("/")
@rol_requerido(*LECTORES)
def listar():
    return estaciones_controller.ctrlListarEstaciones()


@estaciones_bp.get("/<int:id_estacion>/foto")
@rol_requerido(*LECTORES)
def foto(id_estacion):
    return estaciones_controller.ctrlObtenerFotoEstacion(id_estacion)


@estaciones_bp.post("/")
@rol_requerido("ADMINISTRADOR")
def registrar():
    return estaciones_controller.ctrlCURegistrarEstacion()
