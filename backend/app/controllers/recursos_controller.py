"""Controladores de caso de uso: registro de unidad/recurso y cambio de estado."""

from flask import g, jsonify, request

from app.services import recursos_service
from app.services.estaciones_service import ErrorModulo


def _datos():
    datos = request.get_json(silent=True)
    return datos if isinstance(datos, dict) else {}


def _error(exc):
    return jsonify({"error": exc.mensaje, "campo": exc.campo}), exc.codigo


def ctrlCURegistrarUnidadRecurso():
    """CU-02: alta de unidad o recurso ligada a la estación elegida."""
    try:
        registro = recursos_service.crear_unidad_recurso(_datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Registrado correctamente", "registro": registro}), 201


def ctrlCUActualizarEstado(tipo, id_registro):
    """CU-03: cambio de estado con motivo obligatorio según el estado."""
    try:
        registro = recursos_service.cambiar_estado(tipo, id_registro, _datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Estado actualizado correctamente", "registro": registro})
