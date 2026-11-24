from flask import g, jsonify, request

from app.middleware.auth import rol_requerido
from app.services import inspecciones_service


@rol_requerido("BOMBERO")
def crear():
    try:
        inspeccion = inspecciones_service.registrar_inspeccion(
            g.usuario.id_persona, request.get_json(silent=True) or {}
        )
        return jsonify({"ok": True, "data": inspeccion.to_dict(), "mensaje": "Inspección registrada"}), 201
    except ValueError as error:
        return jsonify({"ok": False, "error": str(error)}), 400


@rol_requerido("BOMBERO", "ADMINISTRADOR", "OPERADOR")
def por_zona(id_zona):
    data = [i.to_dict() for i in inspecciones_service.listar_por_zona(id_zona)]
    return jsonify({"ok": True, "data": data, "total": len(data)}), 200
