"""Modelos mínimos de referencia a tablas de otras iteraciones.

Permiten validar llaves foráneas y ejecutar pruebas aisladas sin acoplar
lógica ni endpoints de las iteraciones 1, 3 o 4.
"""

from app.models.brigada import Brigada as BrigadaRef, BrigadaMiembro as BrigadaMiembroRef
from app.models.inspeccion import Inspeccion as InspeccionRef
from app.models.usuario import Persona as PersonaRef
from app.models.zona_riesgo import (
    AlertaPreventiva as AlertaPreventivaRef,
    ZonaRiesgo as ZonaRiesgoRef,
)

__all__ = [
    "AlertaPreventivaRef",
    "BrigadaMiembroRef",
    "BrigadaRef",
    "InspeccionRef",
    "PersonaRef",
    "ZonaRiesgoRef",
]
