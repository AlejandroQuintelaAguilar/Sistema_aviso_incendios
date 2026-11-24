from app.models.usuario import Persona, Rol, Usuario
from app.models.zona_riesgo import ZonaRiesgo, FocoCalorSatelital, AlertaPreventiva, SuperficieQuemada
from app.models.historial_zona import HistorialZona
from app.models.solicitud_zona import SolicitudZona
from app.models.inspeccion import Inspeccion

__all__ = ["Persona", "Rol", "Usuario", "ZonaRiesgo", "FocoCalorSatelital", "AlertaPreventiva", "SuperficieQuemada", "HistorialZona", "SolicitudZona", "Inspeccion"]
