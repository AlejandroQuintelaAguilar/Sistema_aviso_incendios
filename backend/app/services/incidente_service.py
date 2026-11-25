"""Servicio de negocio para la gestión central de incidentes (SRP / OCP / DIP)."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.config.database import db
from app.middleware.error_handler import ConflictError, NotFoundError
from app.models.aviso_incendio import AvisoIncendio
from app.models.estacion import Estacion
from app.models.evaluacion_dano import EvaluacionDano
from app.models.incidente import (
    ESTADOS_INCIDENTE,
    GRAVEDADES_INCIDENTE,
    Incidente,
)
from app.models.incidente_brigada import IncidenteBrigada
from app.models.informe_bombero import InformeBombero
from app.models.referencias import (
    AlertaPreventivaRef,
    BrigadaMiembroRef,
    BrigadaRef,
    InspeccionRef,
    PersonaRef,
    ZonaRiesgoRef,
)
from app.services.referencias_service import (
    ReferenciaValidatorProtocol,
    SQLAlchemyReferenciaValidator,
    serializar_zona_enriquecida,
)
from app.utils.geo_utils import (
    extract_coordinates,
    extract_explicit_coordinates,
    format_ubicacion_con_coordenadas,
    reverse_geocode_ubicacion,
    validate_coordinates,
)
from app.utils.validators import (
    require_non_empty_str,
    validate_enum,
    validate_optional_int,
)
from app.views.incidentes_view import (
    serialize_aviso,
    serialize_evaluacion_dano,
    serialize_incidente,
    serialize_incidente_brigada,
    serialize_informe_bombero,
)

TRANSICIONES_INCIDENTE: dict[str, set[str]] = {
    "ACTIVO": {"CONTROLADO", "EXTINGUIDO", "CERRADO"},
    "CONTROLADO": {"EXTINGUIDO", "CERRADO", "ACTIVO"},
    "EXTINGUIDO": {"CERRADO"},
    "CERRADO": set(),
}


def _build_timeline(
    incidente: Incidente,
    aviso: AvisoIncendio | None,
    asignaciones: list[IncidenteBrigada],
    brigadas_map: dict[int, BrigadaRef],
    informes: list[InformeBombero],
    personas_map: dict[int, PersonaRef],
    evaluacion: EvaluacionDano | None,
) -> list[dict[str, Any]]:
    """Construye una línea de tiempo cronológica del expediente del incidente."""
    eventos: list[dict[str, Any]] = []

    if aviso is not None and aviso.fecha_hora is not None:
        eventos.append(
            {
                "timestamp": aviso.fecha_hora.isoformat(),
                "tipo": "AVISO_RECIBIDO",
                "titulo": f"Aviso ciudadano #{aviso.id_aviso} ({aviso.nivel_urgencia})",
                "detalle": aviso.descripcion or aviso.ubicacion,
            }
        )

    if incidente.fecha_inicio is not None:
        op = personas_map.get(incidente.id_operador) if incidente.id_operador else None
        op_nombre = f"{op.nombres} {op.apellidos}" if op else "Operador sin asignar"
        eventos.append(
            {
                "timestamp": incidente.fecha_inicio.isoformat(),
                "tipo": "INCIDENTE_APERTURADO",
                "titulo": f"Incidente #{incidente.id_incidente} aperturado ({incidente.gravedad})",
                "detalle": f"Ubicación: {incidente.ubicacion} · {op_nombre}",
            }
        )

    for asig in asignaciones:
        if asig.fecha_asignacion is None:
            continue
        brigada = brigadas_map.get(asig.id_brigada)
        b_nombre = brigada.nombre if brigada else f"Brigada #{asig.id_brigada}"
        eventos.append(
            {
                "timestamp": asig.fecha_asignacion.isoformat(),
                "tipo": "BRIGADA_ASIGNADA",
                "titulo": f"Despacho de {b_nombre}",
                "detalle": f"Estado actual de asignación: {asig.estado_asignacion}",
            }
        )

    for inf in informes:
        if inf.fecha_hora is None:
            continue
        bombero = personas_map.get(inf.id_bombero)
        b_nombre = (
            f"{bombero.nombres} {bombero.apellidos}"
            if bombero
            else f"Bombero #{inf.id_bombero}"
        )
        eventos.append(
            {
                "timestamp": inf.fecha_hora.isoformat(),
                "tipo": "INFORME_BOMBERO",
                "titulo": f"Informe en campo — {b_nombre}",
                "detalle": inf.acciones,
            }
        )

    if evaluacion is not None and evaluacion.fecha_evaluacion is not None:
        costo = (
            float(evaluacion.costo_estimado)
            if isinstance(evaluacion.costo_estimado, Decimal)
            else evaluacion.costo_estimado
        )
        eventos.append(
            {
                "timestamp": evaluacion.fecha_evaluacion.isoformat(),
                "tipo": "EVALUACION_DANOS",
                "titulo": f"Evaluación de daños ({evaluacion.nivel_dano})",
                "detalle": f"{evaluacion.tipo_dano} · Costo estimado: {costo}",
            }
        )

    if incidente.fecha_cierre is not None:
        eventos.append(
            {
                "timestamp": incidente.fecha_cierre.isoformat(),
                "tipo": "INCIDENTE_CERRADO",
                "titulo": f"Incidente #{incidente.id_incidente} cerrado oficialmente",
                "detalle": "Todas las brigadas asignadas fueron liberadas",
            }
        )

    eventos.sort(key=lambda e: e["timestamp"])
    return eventos


class IncidenteService:
    """Gestiona la apertura, consulta, expediente y ciclo de vida de los incidentes."""

    def __init__(
        self,
        referencias: ReferenciaValidatorProtocol | None = None,
    ) -> None:
        self._referencias = referencias or SQLAlchemyReferenciaValidator()

    def crear_incidente(self, data: dict[str, Any]) -> Incidente:
        id_aviso = validate_optional_int(data, "id_aviso")
        aviso: AvisoIncendio | None = None
        if id_aviso is not None:
            aviso = db.session.get(AvisoIncendio, id_aviso)
            if aviso is None:
                raise NotFoundError(f"Aviso de incendio con id {id_aviso} no encontrado")
            if aviso.estado_aviso == "DESCARTADO":
                raise ConflictError("No se puede crear un incidente desde un aviso DESCARTADO")

        raw_ubicacion_input = data.get("ubicacion")
        lat_val = data.get("lat")
        lng_val = data.get("lng")

        if isinstance(raw_ubicacion_input, str) and raw_ubicacion_input.strip():
            raw_ubicacion = raw_ubicacion_input.strip()
        elif lat_val is not None and lng_val is not None:
            lat_f, lng_f = validate_coordinates(lat_val, lng_val)
            direccion_real = reverse_geocode_ubicacion(lat_f, lng_f)
            sugerida = self._referencias.sugerir_zona_cercana(lat_f, lng_f)

            if direccion_real and sugerida is not None and sugerida["distancia_km"] <= 10.0:
                if sugerida["nombre"].lower() in direccion_real.lower():
                    raw_ubicacion = direccion_real
                else:
                    raw_ubicacion = f"{direccion_real} — {sugerida['nombre']}"
            elif direccion_real:
                raw_ubicacion = direccion_real
            elif sugerida is not None and sugerida["distancia_km"] <= 25.0:
                raw_ubicacion = f"Sector {sugerida['nombre']}"
            else:
                raw_ubicacion = "Incidente registrado en mapa"
        else:
            raw_ubicacion = require_non_empty_str(data, "ubicacion")

        if (
            lat_val is None
            and lng_val is None
            and aviso is not None
            and extract_explicit_coordinates(raw_ubicacion) is None
        ):
            coords_aviso = extract_coordinates(aviso.ubicacion)
            if coords_aviso is not None:
                lat_val = coords_aviso["lat"]
                lng_val = coords_aviso["lng"]

        ubicacion = format_ubicacion_con_coordenadas(
            raw_ubicacion,
            lat_val,
            lng_val,
        )

        id_operador = validate_optional_int(data, "id_operador")
        if id_operador is not None:
            self._referencias.asegurar_persona(id_operador, "Operador")

        id_zona = validate_optional_int(data, "id_zona")
        if id_zona is not None:
            self._referencias.asegurar_zona(id_zona)
        else:
            coords = extract_coordinates(ubicacion)
            if coords is not None:
                sugerida = self._referencias.sugerir_zona_cercana(
                    coords["lat"], coords["lng"]
                )
                if sugerida is not None and sugerida["distancia_km"] <= 25.0:
                    id_zona = sugerida["id_zona"]

        gravedad = data.get("gravedad", "MEDIA")
        validate_enum(gravedad, GRAVEDADES_INCIDENTE, "gravedad")

        incidente = Incidente(
            id_aviso=id_aviso,
            id_operador=id_operador,
            id_zona=id_zona,
            ubicacion=ubicacion,
            gravedad=gravedad,
            estado="ACTIVO",
        )
        db.session.add(incidente)

        if aviso is not None and aviso.estado_aviso in ("PENDIENTE", "VERIFICADO"):
            aviso.estado_aviso = "ATENDIDO"

        db.session.commit()
        return incidente

    def listar_incidentes(
        self,
        estado: str | None = None,
        gravedad: str | None = None,
        id_zona: int | None = None,
        q: str | None = None,
    ) -> list[Incidente]:
        query = Incidente.query
        if estado:
            validate_enum(estado, ESTADOS_INCIDENTE, "estado")
            query = query.filter_by(estado=estado)
        if gravedad:
            validate_enum(gravedad, GRAVEDADES_INCIDENTE, "gravedad")
            query = query.filter_by(gravedad=gravedad)
        if id_zona is not None:
            query = query.filter_by(id_zona=id_zona)
        if isinstance(q, str) and q.strip():
            termino = q.strip()
            limpio_id = termino.lstrip("#").strip()
            if limpio_id.isdigit():
                query = query.filter(
                    db.or_(
                        Incidente.id_incidente == int(limpio_id),
                        Incidente.ubicacion.ilike(f"%{termino}%"),
                    )
                )
            else:
                query = query.filter(Incidente.ubicacion.ilike(f"%{termino}%"))
        return query.order_by(Incidente.id_incidente.desc()).all()

    def obtener_incidente(self, id_incidente: int) -> Incidente:
        incidente = db.session.get(Incidente, id_incidente)
        if incidente is None:
            raise NotFoundError(f"Incidente con id {id_incidente} no encontrado")
        return incidente

    def cambiar_estado(self, id_incidente: int, nuevo_estado: str) -> Incidente:
        validate_enum(nuevo_estado, ESTADOS_INCIDENTE, "estado")
        incidente = self.obtener_incidente(id_incidente)

        if incidente.estado == nuevo_estado:
            return incidente

        permitidos = TRANSICIONES_INCIDENTE.get(incidente.estado, set())
        if nuevo_estado not in permitidos:
            raise ConflictError(
                f"Transición de incidente inválida: '{incidente.estado}' -> '{nuevo_estado}'"
            )

        if nuevo_estado == "CERRADO":
            tiene_informe = (
                InformeBombero.query.filter_by(id_incidente=id_incidente).first()
                is not None
            )
            if not tiene_informe:
                raise ConflictError(
                    "No se puede cerrar el incidente sin al menos un informe de bombero registrado"
                )
            incidente.fecha_cierre = datetime.now(timezone.utc)
            asignaciones_activas = (
                IncidenteBrigada.query.filter_by(id_incidente=id_incidente)
                .filter(IncidenteBrigada.estado_asignacion != "LIBERADA")
                .all()
            )
            for asig in asignaciones_activas:
                asig.estado_asignacion = "LIBERADA"
                otra_activa = (
                    IncidenteBrigada.query.filter_by(id_brigada=asig.id_brigada)
                    .filter(
                        IncidenteBrigada.estado_asignacion != "LIBERADA",
                        IncidenteBrigada.id_incidente != id_incidente,
                    )
                    .first()
                )
                if otra_activa is None:
                    brigada = db.session.get(BrigadaRef, asig.id_brigada)
                    if brigada is not None and brigada.estado == "EN_OPERACION":
                        brigada.estado = "ACTIVA"
                        brigada.motivo_estado = (
                            f"Liberada por cierre de Incidente #{id_incidente}"
                        )

        incidente.estado = nuevo_estado
        db.session.commit()
        return incidente

    def actualizar_incidente(
        self, id_incidente: int, data: dict[str, Any]
    ) -> Incidente:
        """Permite clasificar o actualizar datos operativos de un incidente no cerrado."""
        incidente = self.obtener_incidente(id_incidente)
        if incidente.estado == "CERRADO":
            raise ConflictError("No se puede modificar un incidente CERRADO")

        if "ubicacion" in data:
            incidente.ubicacion = format_ubicacion_con_coordenadas(
                require_non_empty_str(data, "ubicacion"),
                data.get("lat"),
                data.get("lng"),
            )

        if "gravedad" in data:
            incidente.gravedad = validate_enum(
                data["gravedad"], GRAVEDADES_INCIDENTE, "gravedad"
            )

        if "id_zona" in data:
            id_zona = validate_optional_int(data, "id_zona")
            if id_zona is not None:
                self._referencias.asegurar_zona(id_zona)
            incidente.id_zona = id_zona

        if "id_operador" in data:
            id_operador = validate_optional_int(data, "id_operador")
            if id_operador is not None:
                self._referencias.asegurar_persona(id_operador, "Operador")
            incidente.id_operador = id_operador

        db.session.commit()
        return incidente

    def obtener_expediente(self, id_incidente: int) -> dict[str, Any]:
        """Retorna el expediente completo y timeline cronológico de un incidente."""
        incidente = self.obtener_incidente(id_incidente)
        aviso = (
            db.session.get(AvisoIncendio, incidente.id_aviso)
            if incidente.id_aviso is not None
            else None
        )
        zona = (
            db.session.get(ZonaRiesgoRef, incidente.id_zona)
            if incidente.id_zona is not None
            else None
        )
        operador = (
            db.session.get(PersonaRef, incidente.id_operador)
            if incidente.id_operador is not None
            else None
        )

        asignaciones = (
            IncidenteBrigada.query.filter_by(id_incidente=id_incidente)
            .order_by(IncidenteBrigada.fecha_asignacion.asc())
            .all()
        )
        informes = (
            InformeBombero.query.filter_by(id_incidente=id_incidente)
            .order_by(InformeBombero.fecha_hora.asc())
            .all()
        )
        evaluacion = EvaluacionDano.query.filter_by(id_incidente=id_incidente).first()

        personas_map = {p.id_persona: p for p in PersonaRef.query.all()}
        brigadas_map = {b.id_brigada: b for b in BrigadaRef.query.all()}
        estaciones_map = {e.id_estacion: e for e in Estacion.query.all()}
        miembros_activos = BrigadaMiembroRef.query.filter_by(estado="ACTIVO").all()

        miembros_count: dict[int, int] = {}
        jefe_por_brigada: dict[int, str] = {}
        for m in miembros_activos:
            miembros_count[m.id_brigada] = miembros_count.get(m.id_brigada, 0) + 1
            if (
                m.rol_en_brigada == "JEFE_CUADRILLA"
                and m.id_brigada not in jefe_por_brigada
            ):
                persona_jefe = personas_map.get(m.id_persona)
                jefe_por_brigada[m.id_brigada] = (
                    f"{persona_jefe.nombres} {persona_jefe.apellidos}"
                    if persona_jefe
                    else f"Bombero #{m.id_persona}"
                )

        brigadas_serializadas = []
        for asig in asignaciones:
            item = serialize_incidente_brigada(asig)
            brigada = brigadas_map.get(asig.id_brigada)
            est = estaciones_map.get(brigada.id_estacion) if brigada else None
            item["nombre_brigada"] = (
                brigada.nombre if brigada else f"Brigada #{asig.id_brigada}"
            )
            item["estacion_nombre"] = est.nombre if est else None
            item["jefe_cuadrilla"] = jefe_por_brigada.get(asig.id_brigada)
            item["cantidad_miembros"] = miembros_count.get(asig.id_brigada, 0)
            brigadas_serializadas.append(item)

        informes_serializados = []
        for inf in informes:
            item = serialize_informe_bombero(inf)
            bombero = personas_map.get(inf.id_bombero)
            item["nombre_bombero"] = (
                f"{bombero.nombres} {bombero.apellidos}"
                if bombero
                else f"Bombero #{inf.id_bombero}"
            )
            informes_serializados.append(item)

        zona_serializada = None
        if zona is not None:
            ultima_alerta = (
                AlertaPreventivaRef.query.filter_by(id_zona=zona.id_zona)
                .order_by(
                    AlertaPreventivaRef.fecha_emision.desc(),
                    AlertaPreventivaRef.id_alerta.desc(),
                )
                .first()
            )
            ultima_inspeccion = (
                InspeccionRef.query.filter_by(id_zona=zona.id_zona)
                .order_by(
                    InspeccionRef.fecha_inspeccion.desc(),
                    InspeccionRef.id_inspeccion.desc(),
                )
                .first()
            )
            zona_serializada = serializar_zona_enriquecida(
                zona,
                ultima_alerta=ultima_alerta,
                ultima_inspeccion=ultima_inspeccion,
            )

        return {
            "incidente": serialize_incidente(incidente),
            "aviso_origen": serialize_aviso(aviso) if aviso else None,
            "zona": zona_serializada,
            "operador": (
                {
                    "id_persona": operador.id_persona,
                    "nombre_completo": f"{operador.nombres} {operador.apellidos}",
                    "tipo_persona": operador.tipo_persona,
                }
                if operador
                else None
            ),
            "brigadas": brigadas_serializadas,
            "informes": informes_serializados,
            "evaluacion_danos": (
                serialize_evaluacion_dano(evaluacion) if evaluacion else None
            ),
            "timeline": _build_timeline(
                incidente=incidente,
                aviso=aviso,
                asignaciones=asignaciones,
                brigadas_map=brigadas_map,
                informes=informes,
                personas_map=personas_map,
                evaluacion=evaluacion,
            ),
        }

    def obtener_resumen_operativo(self) -> dict[str, Any]:
        """Calcula métricas operativas en tiempo real para el centro de comando."""
        incidentes = Incidente.query.all()
        avisos = AvisoIncendio.query.all()
        brigadas = BrigadaRef.query.all()
        asignaciones_activas = IncidenteBrigada.query.filter(
            IncidenteBrigada.estado_asignacion != "LIBERADA"
        ).all()
        evaluaciones = EvaluacionDano.query.all()
        zonas = ZonaRiesgoRef.query.all()

        zonas_activas = sum(
            1 for z in zonas if (getattr(z, "estado", None) or "Activa") != "Inactiva"
        )
        zonas_criticas = sum(
            1
            for z in zonas
            if (getattr(z, "estado", None) or "Activa") != "Inactiva"
            and z.nivel_riesgo in ("ALTO", "EXTREMO")
        )
        zonas_con_alerta_coe = sum(
            1
            for z in zonas
            if (getattr(z, "estado", None) or "Activa") == "Alerta Emitida"
        )

        por_estado = {e: 0 for e in ESTADOS_INCIDENTE}
        por_gravedad = {g: 0 for g in GRAVEDADES_INCIDENTE}
        for inc in incidentes:
            por_estado[inc.estado] = por_estado.get(inc.estado, 0) + 1
            por_gravedad[inc.gravedad] = por_gravedad.get(inc.gravedad, 0) + 1

        avisos_por_estado: dict[str, int] = {}
        alertas_sla_activas = 0
        for aviso in avisos:
            avisos_por_estado[aviso.estado_aviso] = (
                avisos_por_estado.get(aviso.estado_aviso, 0) + 1
            )
            if serialize_aviso(aviso)["alerta_sla"]:
                alertas_sla_activas += 1

        brigadas_ocupadas_ids = {a.id_brigada for a in asignaciones_activas}
        brigadas_disponibles = sum(
            1
            for b in brigadas
            if b.estado == "ACTIVA" and b.id_brigada not in brigadas_ocupadas_ids
        )
        brigadas_desplegadas = sum(
            1
            for b in brigadas
            if b.estado == "EN_OPERACION" or b.id_brigada in brigadas_ocupadas_ids
        )

        costo_total = sum(
            float(ev.costo_estimado)
            if isinstance(ev.costo_estimado, Decimal)
            else float(ev.costo_estimado or 0)
            for ev in evaluaciones
        )

        return {
            "incidentes_total": len(incidentes),
            "incidentes_por_estado": por_estado,
            "incidentes_por_gravedad": por_gravedad,
            "avisos_total": len(avisos),
            "avisos_por_estado": avisos_por_estado,
            "alertas_sla_activas": alertas_sla_activas,
            "brigadas_total": len(brigadas),
            "brigadas_desplegadas": brigadas_desplegadas,
            "brigadas_disponibles": brigadas_disponibles,
            "zonas_activas": zonas_activas,
            "zonas_criticas": zonas_criticas,
            "zonas_con_alerta_coe": zonas_con_alerta_coe,
            "costo_danos_estimado_total": round(costo_total, 2),
        }
