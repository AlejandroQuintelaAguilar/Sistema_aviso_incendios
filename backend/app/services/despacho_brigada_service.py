"""Servicio de negocio para despacho y seguimiento de brigadas en incidentes."""

from typing import Any

from app.config.database import db
from app.middleware.error_handler import ConflictError, NotFoundError
from app.models.incidente import Incidente
from app.models.incidente_brigada import (
    ESTADOS_ASIGNACION_BRIGADA,
    IncidenteBrigada,
)
from app.models.referencias import BrigadaRef
from app.services.referencias_service import (
    ReferenciaValidatorProtocol,
    SQLAlchemyReferenciaValidator,
)
from app.utils.geo_utils import estimar_eta_min, extract_coordinates, haversine_km
from app.utils.validators import require_positive_int, validate_enum

META_BRIGADAS_POR_GRAVEDAD: dict[str, int] = {
    "BAJA": 1,
    "MEDIA": 1,
    "ALTA": 2,
    "CATASTROFICA": 3,
}

TRANSICIONES_ASIGNACION: dict[str, set[str]] = {
    "ASIGNADA": {"EN_CAMINO", "EN_SITIO", "LIBERADA"},
    "EN_CAMINO": {"EN_SITIO", "LIBERADA"},
    "EN_SITIO": {"LIBERADA"},
    "LIBERADA": set(),
}


class DespachoBrigadaService:
    """Gestiona la asignación y evolución operativa de brigadas en un incidente."""

    def __init__(
        self,
        referencias: ReferenciaValidatorProtocol | None = None,
    ) -> None:
        self._referencias = referencias or SQLAlchemyReferenciaValidator()

    def _asegurar_incidente(self, id_incidente: int) -> Incidente:
        incidente = db.session.get(Incidente, id_incidente)
        if incidente is None:
            raise NotFoundError(f"Incidente con id {id_incidente} no encontrado")
        return incidente

    def listar_por_incidente(self, id_incidente: int) -> list[IncidenteBrigada]:
        self._asegurar_incidente(id_incidente)
        return (
            IncidenteBrigada.query.filter_by(id_incidente=id_incidente)
            .order_by(IncidenteBrigada.fecha_asignacion.desc())
            .all()
        )

    def _sincronizar_estado_brigada_al_liberar(
        self, id_brigada: int, id_incidente_actual: int
    ) -> None:
        otra_activa = (
            IncidenteBrigada.query.filter_by(id_brigada=id_brigada)
            .filter(
                IncidenteBrigada.estado_asignacion != "LIBERADA",
                IncidenteBrigada.id_incidente != id_incidente_actual,
            )
            .first()
        )
        if otra_activa is not None:
            return
        brigada = db.session.get(BrigadaRef, id_brigada)
        if brigada is not None and brigada.estado == "EN_OPERACION":
            brigada.estado = "ACTIVA"
            brigada.motivo_estado = f"Liberada desde Incidente #{id_incidente_actual}"

    def asignar_brigada(
        self, id_incidente: int, data: dict[str, Any]
    ) -> IncidenteBrigada:
        incidente = self._asegurar_incidente(id_incidente)
        if incidente.estado == "CERRADO":
            raise ConflictError("No se pueden asignar brigadas a un incidente CERRADO")

        id_brigada = require_positive_int(data, "id_brigada")

        asignacion_activa = (
            IncidenteBrigada.query.filter_by(id_brigada=id_brigada)
            .filter(IncidenteBrigada.estado_asignacion != "LIBERADA")
            .first()
        )
        if asignacion_activa is not None:
            if asignacion_activa.id_incidente == id_incidente:
                raise ConflictError(
                    f"La brigada {id_brigada} ya tiene una asignación activa en el incidente {id_incidente}"
                )
            raise ConflictError(
                f"La brigada {id_brigada} ya se encuentra ocupada en el incidente {asignacion_activa.id_incidente}"
            )

        self._referencias.asegurar_brigada_disponible(id_brigada)

        estado_inicial = data.get("estado_asignacion", "ASIGNADA")
        validate_enum(estado_inicial, ESTADOS_ASIGNACION_BRIGADA, "estado_asignacion")

        asignacion = IncidenteBrigada(
            id_incidente=id_incidente,
            id_brigada=id_brigada,
            estado_asignacion=estado_inicial,
        )
        db.session.add(asignacion)

        if estado_inicial != "LIBERADA":
            brigada = db.session.get(BrigadaRef, id_brigada)
            if brigada is not None and brigada.estado == "ACTIVA":
                brigada.estado = "EN_OPERACION"
                brigada.motivo_estado = f"Desplegada en Incidente #{id_incidente}"

        db.session.commit()
        return asignacion

    def cambiar_estado_asignacion(
        self, id_incidente: int, id_brigada: int, nuevo_estado: str
    ) -> IncidenteBrigada:
        self._asegurar_incidente(id_incidente)
        validate_enum(nuevo_estado, ESTADOS_ASIGNACION_BRIGADA, "estado_asignacion")

        asignacion = (
            IncidenteBrigada.query.filter_by(
                id_incidente=id_incidente, id_brigada=id_brigada
            )
            .order_by(IncidenteBrigada.fecha_asignacion.desc())
            .first()
        )
        if asignacion is None:
            raise NotFoundError(
                f"No existe asignación de brigada {id_brigada} en el incidente {id_incidente}"
            )

        if asignacion.estado_asignacion == nuevo_estado:
            return asignacion

        permitidos = TRANSICIONES_ASIGNACION.get(asignacion.estado_asignacion, set())
        if nuevo_estado not in permitidos:
            raise ConflictError(
                f"Transición de asignación inválida: '{asignacion.estado_asignacion}' -> '{nuevo_estado}'"
            )

        asignacion.estado_asignacion = nuevo_estado
        if nuevo_estado == "LIBERADA":
            self._sincronizar_estado_brigada_al_liberar(id_brigada, id_incidente)
        db.session.commit()
        return asignacion

    def sugerir_despacho(self, id_incidente: int) -> dict[str, Any]:
        """Sugiere brigadas y estaciones cercanas ordenadas por disponibilidad y distancia Haversine."""
        incidente = self._asegurar_incidente(id_incidente)
        catalogos = self._referencias.listar_catalogos()

        coords_inc = extract_coordinates(incidente.ubicacion)
        if coords_inc is None and incidente.id_zona is not None:
            zona = next(
                (z for z in catalogos["zonas"] if z["id_zona"] == incidente.id_zona),
                None,
            )
            if zona:
                coords_inc = zona.get("coordenadas")

        asignaciones = self.listar_por_incidente(id_incidente)
        ids_activas_aqui = {
            a.id_brigada for a in asignaciones if a.estado_asignacion != "LIBERADA"
        }
        activas_en_incidente = len(ids_activas_aqui)
        meta_brigadas = META_BRIGADAS_POR_GRAVEDAD.get(incidente.gravedad, 1)
        faltantes = max(0, meta_brigadas - activas_en_incidente)

        def _distancia_y_eta(coords_origen: dict[str, float] | None):
            if coords_inc is None or coords_origen is None:
                return None, None
            dist = round(
                haversine_km(
                    coords_inc["lat"],
                    coords_inc["lng"],
                    coords_origen["lat"],
                    coords_origen["lng"],
                ),
                2,
            )
            return dist, estimar_eta_min(dist)

        brigadas_enriquecidas: list[dict[str, Any]] = []
        for b in catalogos["brigadas"]:
            dist_km, eta_min = _distancia_y_eta(b.get("estacion_coordenadas"))
            disp = bool(
                b.get("disponible") and b["id_brigada"] not in ids_activas_aqui
            )
            brigadas_enriquecidas.append(
                {
                    **b,
                    "disponible": disp,
                    "distancia_km": dist_km,
                    "eta_min": eta_min,
                }
            )

        brigadas_ordenadas = sorted(
            brigadas_enriquecidas,
            key=lambda b: (
                0 if b["disponible"] else 1,
                b["distancia_km"] if b["distancia_km"] is not None else float("inf"),
                0 if (b.get("cantidad_miembros") or 0) > 0 else 1,
                b["id_brigada"],
            ),
        )

        brigada_recomendada = next(
            (b for b in brigadas_ordenadas if b["disponible"]), None
        )

        estaciones_cercanas: list[dict[str, Any]] = []
        for est in catalogos.get("estaciones_geo", []):
            dist_km, eta_min = _distancia_y_eta(est.get("coordenadas"))
            estaciones_cercanas.append(
                {
                    **est,
                    "distancia_km": dist_km,
                    "eta_min": eta_min,
                }
            )
        estaciones_cercanas.sort(
            key=lambda e: (
                e["distancia_km"] if e["distancia_km"] is not None else float("inf"),
                e["id_estacion"],
            )
        )

        return {
            "id_incidente": incidente.id_incidente,
            "gravedad": incidente.gravedad,
            "coordenadas_incidente": coords_inc,
            "meta_brigadas": meta_brigadas,
            "activas_en_incidente": activas_en_incidente,
            "faltantes": faltantes,
            "brigada_recomendada": brigada_recomendada,
            "brigadas": brigadas_ordenadas,
            "estaciones_cercanas": estaciones_cercanas,
        }
