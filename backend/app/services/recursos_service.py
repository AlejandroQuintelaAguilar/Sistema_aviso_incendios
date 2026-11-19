"""Reglas de negocio de unidades y recursos (iteración 2).

Se mapean las columnas físicas reales: `unidades.codigo` / `unidades.capacidad`
(texto) y `recursos.nombre` / `recursos.tipo_recurso` / `recursos.cantidad`.
"""

import re

from sqlalchemy.exc import SQLAlchemyError

from app.config.database import db
from app.models.estacion import Estacion, Recurso, Unidad
from app.services.estaciones_service import (
    ESTADOS_CON_MOTIVO,
    ESTADOS_RECURSO,
    ESTADOS_UNIDAD,
    TIPOS_RECURSO,
    ErrorModulo,
    normalizar_estado,
    texto,
)
from app.views.recursos_view import recurso_a_dict, unidad_a_dict

NUMERO_RE = re.compile(r"^\d+(\.\d+)?$")


def _estacion_desde(data):
    valor = data.get("id_estacion")
    try:
        id_estacion = int(valor)
    except (TypeError, ValueError):
        raise ErrorModulo("Estación: selecciona una estación válida", "id_estacion")
    estacion = db.session.get(Estacion, id_estacion)
    if estacion is None:
        raise ErrorModulo("Estación: la estación seleccionada no existe", "id_estacion")
    return estacion


def _positivo(valor, campo, etiqueta, entero=False):
    if isinstance(valor, bool) or valor is None:
        raise ErrorModulo(f"{etiqueta}: debe ser un número mayor que 0", campo)
    if isinstance(valor, (int, float)):
        numero = float(valor)
    elif isinstance(valor, str):
        limpio = valor.strip().replace(",", ".")
        if not NUMERO_RE.fullmatch(limpio):
            raise ErrorModulo(f"{etiqueta}: debe ser un número mayor que 0", campo)
        numero = float(limpio)
    else:
        raise ErrorModulo(f"{etiqueta}: debe ser un número mayor que 0", campo)

    if numero <= 0:
        raise ErrorModulo(f"{etiqueta}: debe ser mayor que 0", campo)
    if entero and not numero.is_integer():
        raise ErrorModulo(f"{etiqueta}: debe ser un número entero", campo)
    return int(numero) if entero else numero


def _capacidad_como_texto(numero):
    return str(int(numero)) if numero.is_integer() else str(numero)


def crear_unidad_recurso(data, administrador):
    """CU-02: registrar una unidad o un recurso en la estación elegida."""
    if not isinstance(data, dict):
        raise ErrorModulo("Los datos del registro no son válidos")

    categoria = str(data.get("categoria", "")).strip().upper()
    if categoria not in ("UNIDAD", "RECURSO"):
        raise ErrorModulo("Categoría: elige Unidad o Recurso", "categoria")

    estacion = _estacion_desde(data)
    id_administrador = administrador.persona.id_persona

    if categoria == "UNIDAD":
        codigo = texto(data, "codigo", "Código", 50)
        if Unidad.query.filter_by(codigo=codigo).first() is not None:
            raise ErrorModulo("Código: ya existe una unidad con ese código", "codigo")
        tipo = texto(data, "tipo", "Tipo", 50)
        capacidad = _positivo(data.get("capacidad"), "capacidad", "Capacidad")
        registro = Unidad(
            codigo=codigo,
            tipo=tipo,
            capacidad=_capacidad_como_texto(capacidad),
            estado="DISPONIBLE",
            motivo_estado=None,
            id_estacion=estacion.id_estacion,
            id_administrador=id_administrador,
        )
        vista = unidad_a_dict
    else:
        nombre = texto(data, "nombre", "Nombre", 100)
        if (
            Recurso.query.filter(db.func.lower(Recurso.nombre) == nombre.lower()).first()
            is not None
        ):
            raise ErrorModulo("Nombre: ya existe un recurso con ese nombre", "nombre")
        tipo_recurso = texto(data, "tipo_recurso", "Tipo de recurso", 30).lower()
        if tipo_recurso not in TIPOS_RECURSO:
            raise ErrorModulo(
                "Tipo de recurso: elige equipo, herramienta o insumo", "tipo_recurso"
            )
        cantidad = _positivo(data.get("cantidad"), "cantidad", "Cantidad", entero=True)
        registro = Recurso(
            nombre=nombre,
            tipo_recurso=tipo_recurso,
            cantidad=cantidad,
            estado="DISPONIBLE",
            motivo_estado=None,
            id_estacion=estacion.id_estacion,
            id_administrador=id_administrador,
        )
        vista = recurso_a_dict

    db.session.add(registro)
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise ErrorModulo("No se pudo guardar el registro. Intenta de nuevo", codigo=500)
    return vista(registro, estacion)


def cambiar_estado(tipo, id_registro, data, usuario):
    """CU-03: cambiar el estado y guardar el motivo cuando corresponde."""
    categoria = str(tipo).strip().lower()
    modelo = {"unidad": Unidad, "recurso": Recurso}.get(categoria)
    if modelo is None:
        raise ErrorModulo("Tipo: debe ser unidad o recurso", "tipo")

    registro = db.session.get(modelo, id_registro)
    if registro is None:
        raise ErrorModulo("El registro no existe", codigo=404)

    if not isinstance(data, dict):
        raise ErrorModulo("Los datos del cambio no son válidos")
    estado = normalizar_estado(data.get("estado"))
    estados_permitidos = ESTADOS_UNIDAD if categoria == "unidad" else ESTADOS_RECURSO
    if estado not in estados_permitidos:
        raise ErrorModulo(
            "Estado: no es válido para la categoría seleccionada", "estado"
        )

    motivo = data.get("motivo", "")
    if motivo is None:
        motivo = ""
    if not isinstance(motivo, str):
        raise ErrorModulo("Motivo: debe ser texto", "motivo")
    motivo = motivo.strip()
    if len(motivo) > 500:
        raise ErrorModulo("Motivo: admite como máximo 500 caracteres", "motivo")
    if estado in ESTADOS_CON_MOTIVO and not motivo:
        raise ErrorModulo("Motivo: es obligatorio para este estado", "motivo")

    registro.estado = estado
    registro.motivo_estado = motivo or None
    registro.updated_at = db.func.now()
    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        raise ErrorModulo("No se pudo actualizar el estado. Intenta de nuevo", codigo=500)

    estacion = db.session.get(Estacion, registro.id_estacion)
    resultado = (
        unidad_a_dict(registro, estacion)
        if categoria == "unidad"
        else recurso_a_dict(registro, estacion)
    )
    resultado["modificado_por"] = usuario.nombre_usuario
    return resultado
