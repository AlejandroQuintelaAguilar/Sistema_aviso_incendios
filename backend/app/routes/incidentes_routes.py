"""Rutas Blueprint para incidentes (/api/incidentes) y sus subrecursos."""

from functools import wraps

from flask import Blueprint, current_app
from app.controllers.incidentes_controller import IncidentesController
from app.middleware.auth import rol_requerido

incidentes_bp = Blueprint("incidentes", __name__, url_prefix="/api/incidentes")
_controller = IncidentesController()

ROLES_LECTURA_OPERATIVA = ("ADMINISTRADOR", "OPERADOR", "BOMBERO")
ROLES_COMANDO = ("ADMINISTRADOR", "OPERADOR")


def _roles_si_activo(*roles):
    """Aplica verificación JWT por rol fuera de entorno TESTING aislado."""

    def decorador(funcion):
        protegida = rol_requerido(*roles)(funcion)

        @wraps(funcion)
        def envoltura(*args, **kwargs):
            if current_app.config.get("TESTING"):
                return funcion(*args, **kwargs)
            return protegida(*args, **kwargs)

        return envoltura

    return decorador


# Incidentes (referencias queda abierto para el portal ciudadano SOS sin login)
incidentes_bp.get("/referencias")(_controller.referencias)
incidentes_bp.get("/resumen-operativo")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.resumen_operativo)
)
incidentes_bp.get("/satelite-firms")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.satelite_firms)
)
incidentes_bp.get("")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.listar)
)
incidentes_bp.post("")(
    _roles_si_activo(*ROLES_COMANDO)(_controller.crear)
)
incidentes_bp.get("/<int:id_incidente>")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.obtener)
)
incidentes_bp.get("/<int:id_incidente>/expediente")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.expediente)
)
incidentes_bp.patch("/<int:id_incidente>")(
    _roles_si_activo(*ROLES_COMANDO)(_controller.actualizar)
)
incidentes_bp.patch("/<int:id_incidente>/estado")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.cambiar_estado)
)
incidentes_bp.patch("/<int:id_incidente>/cerrar")(
    _roles_si_activo(*ROLES_COMANDO)(_controller.cerrar)
)

# Brigadas asignadas
incidentes_bp.get("/<int:id_incidente>/brigadas")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.listar_brigadas)
)
incidentes_bp.get("/<int:id_incidente>/despacho-sugerido")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.despacho_sugerido)
)
incidentes_bp.post("/<int:id_incidente>/brigadas")(
    _roles_si_activo(*ROLES_COMANDO)(_controller.asignar_brigada)
)
incidentes_bp.patch("/<int:id_incidente>/brigadas/<int:id_brigada>/estado")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.cambiar_estado_brigada)
)

# Informes de bombero
incidentes_bp.get("/<int:id_incidente>/informes")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.listar_informes)
)
incidentes_bp.post("/<int:id_incidente>/informes")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.crear_informe)
)

# Evaluación de daños (1:1)
incidentes_bp.get("/<int:id_incidente>/evaluacion-danos")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.obtener_evaluacion)
)
incidentes_bp.post("/<int:id_incidente>/evaluacion-danos")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.crear_evaluacion)
)
incidentes_bp.put("/<int:id_incidente>/evaluacion-danos")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.actualizar_evaluacion)
)
