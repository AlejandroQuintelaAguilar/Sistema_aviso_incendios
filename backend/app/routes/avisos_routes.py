"""Rutas Blueprint para avisos de incendio (/api/avisos)."""

from functools import wraps

from flask import Blueprint, current_app
from app.controllers.avisos_controller import AvisosController
from app.middleware.auth import login_requerido, rol_requerido

avisos_bp = Blueprint("avisos", __name__, url_prefix="/api/avisos")
_controller = AvisosController()

ROLES_LECTURA_OPERATIVA = ("ADMINISTRADOR", "OPERADOR", "BOMBERO")
ROLES_COMANDO = ("ADMINISTRADOR", "OPERADOR")


def _login_si_activo(funcion):
    """Aplica verificación JWT de sesión iniciada fuera de TESTING aislado."""
    protegida = login_requerido(funcion)

    @wraps(funcion)
    def envoltura(*args, **kwargs):
        if current_app.config.get("TESTING"):
            return funcion(*args, **kwargs)
        return protegida(*args, **kwargs)

    return envoltura


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


# Públicos (portal ciudadano SOS anónimo o autenticado)
avisos_bp.get("/cercanos")(_controller.cercanos)
avisos_bp.get("/mios")(_login_si_activo(_controller.mis_avisos))
avisos_bp.post("")(_controller.crear)
avisos_bp.get("/<int:id_aviso>")(_controller.obtener)
avisos_bp.patch("/<int:id_aviso>/descripcion")(_controller.enviar_descripcion)

# Lectura operativa
avisos_bp.get("")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.listar)
)
avisos_bp.get("/agrupados")(
    _roles_si_activo(*ROLES_LECTURA_OPERATIVA)(_controller.agrupados)
)

# Comando / Triage
avisos_bp.patch("/<int:id_aviso>/estado")(
    _roles_si_activo(*ROLES_COMANDO)(_controller.cambiar_estado)
)
avisos_bp.post("/consolidar-grupo")(
    _roles_si_activo(*ROLES_COMANDO)(_controller.consolidar_grupo)
)
