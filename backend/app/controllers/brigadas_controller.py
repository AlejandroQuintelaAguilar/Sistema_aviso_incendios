"""Controladores de caso de uso: brigadas, integrantes y asignaciones."""

from flask import g, jsonify, request

from app.services import brigadas_service
from app.services.brigadas_service import ErrorModulo


def _datos():
    datos = request.get_json(silent=True)
    return datos if isinstance(datos, dict) else {}


def _error(exc):
    return jsonify({"error": exc.mensaje, "campo": exc.campo}), exc.codigo


def listar():
    """CU-05: listado general de brigadas."""
    return jsonify(
        brigadas_service.listar_brigadas(
            estado=request.args.get("estado"),
            disponibilidad=request.args.get("disponibilidad"),
            orden=request.args.get("orden"),
        )
    )


def consultar():
    """CU-05: consulta detallada con filtros de estado y disponibilidad."""
    try:
        datos = brigadas_service.consultar(
            estado=request.args.get("estado"),
            disponibilidad=request.args.get("disponibilidad"),
            orden=request.args.get("orden"),
        )
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify(datos)


def disponibles():
    """CU-13: contrato consumido por la iteración 5 (Incidentes)."""
    return jsonify(brigadas_service.consultar_disponibilidad())


def obtener(id_brigada):
    try:
        return jsonify(brigadas_service.obtener_brigada(id_brigada))
    except ErrorModulo as exc:
        return _error(exc)


def bomberos_disponibles():
    """CU-08: bomberos libres para asignar a una brigada."""
    return jsonify(brigadas_service.bomberos_disponibles())


def crear():
    """CU-01: alta de brigada."""
    try:
        brigada = brigadas_service.crear_brigada(_datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Brigada registrada correctamente", "brigada": brigada}), 201


def editar(id_brigada):
    """CU-02: editar nombre y estación."""
    try:
        brigada = brigadas_service.editar_brigada(id_brigada, _datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Brigada actualizada correctamente", "brigada": brigada})


def cambiar_estado(id_brigada):
    """CU-11: actualizar estado/disponibilidad con motivo obligatorio."""
    try:
        brigada = brigadas_service.cambiar_estado(id_brigada, _datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Estado actualizado correctamente", "brigada": brigada})


def desactivar(id_brigada):
    """CU-03: baja lógica de la brigada."""
    try:
        brigada = brigadas_service.desactivar_brigada(id_brigada, _datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Brigada desactivada correctamente", "brigada": brigada})


def reactivar(id_brigada):
    """CU-04: reactivar una brigada dada de baja."""
    try:
        brigada = brigadas_service.reactivar_brigada(id_brigada, _datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Brigada reactivada correctamente", "brigada": brigada})


def mis_brigadas():
    """CU-05/CU-06: solo lectura, el bombero ve dónde está asignado."""
    return jsonify(brigadas_service.mis_brigadas(g.usuario))


def listar_miembros(id_brigada):
    """CU-06: ver integrantes de la brigada."""
    try:
        return jsonify(brigadas_service.listar_miembros(id_brigada))
    except ErrorModulo as exc:
        return _error(exc)


def asignar_miembros(id_brigada):
    """CU-07: asignar bomberos (incluye la notificación interna)."""
    try:
        resultado = brigadas_service.asignar_miembros(id_brigada, _datos(), g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify(
        {
            "mensaje": (
                f"Bomberos asignados y notificación interna registrada para "
                f"{resultado['notificacion']['integrantes']} integrantes"
            ),
            **resultado,
        }
    ), 201


def retirar_miembro(id_brigada, id_persona):
    """CU-10: retirar integrante de la brigada."""
    try:
        miembro = brigadas_service.retirar_miembro(id_brigada, id_persona, g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify({"mensaje": "Integrante retirado correctamente", "miembro": miembro})


def incendios_asignados():
    """CU-14: incendios asignados a la brigada del jefe en sesión."""
    return jsonify(brigadas_service.incendios_asignados(g.usuario))


def confirmar_recepcion(id_incidente, id_brigada):
    """CU-15: confirmación de recepción por el jefe de cuadrilla."""
    try:
        resultado = brigadas_service.confirmar_recepcion(id_incidente, id_brigada, g.usuario)
    except ErrorModulo as exc:
        return _error(exc)
    return jsonify(resultado)
