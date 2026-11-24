import { useEffect, useRef, useState } from 'react';
import {
  claseEstadoBrigada,
  estadoAsignacion,
  etiquetaEstadoBrigada,
  etiquetaRolBrigada,
} from '../../components/brigadas/estadosBrigada';
import { StatusBadge } from '../../components/common/StatusBadge';
import Icono from '../../components/layout/IconosVigia';
import {
  estadoRecurso,
  estadoUnidad,
  iconoRecurso,
} from '../../components/recursos/estadosRecursos';
import { haversineKm } from '../../utils/tacticalMapHelpers';
import { CerrarIncidenteModal } from './CerrarIncidenteModal';

const TRANSICIONES_INCIDENTE = {
  ACTIVO: ['CONTROLADO', 'EXTINGUIDO', 'CERRADO'],
  CONTROLADO: ['EXTINGUIDO', 'CERRADO', 'ACTIVO'],
  EXTINGUIDO: ['CERRADO'],
  CERRADO: [],
};

const ETAPAS_CICLO = ['ACTIVO', 'CONTROLADO', 'EXTINGUIDO', 'CERRADO'];

const ETIQUETA_TRANSICION = {
  CONTROLADO: 'Marcar Controlado',
  EXTINGUIDO: 'Marcar Extinguido',
  CERRADO: 'Cerrar Incidente',
  ACTIVO: 'Reactivar por rebrote',
};

const TRANSICIONES_BRIGADA = {
  ASIGNADA: ['EN_CAMINO', 'EN_SITIO', 'LIBERADA'],
  EN_CAMINO: ['EN_SITIO', 'LIBERADA'],
  EN_SITIO: ['LIBERADA'],
  LIBERADA: [],
};

const ETIQUETAS_TRANSICION_BRIGADA = {
  EN_CAMINO: 'Salir en camino',
  EN_SITIO: 'Llegó al sitio',
  LIBERADA: 'Liberar brigada',
};

const PASOS_BRIGADA = ['ASIGNADA', 'EN_CAMINO', 'EN_SITIO'];

const GRAVEDADES = ['BAJA', 'MEDIA', 'ALTA', 'CATASTROFICA'];
const NIVELES_DANO = ['LEVE', 'MODERADO', 'SEVERO', 'TOTAL'];

const ACCIONES_CAMPO_RAPIDAS = [
  'Ataque directo con agua',
  'Línea de defensa / cortafuego',
  'Enfriamiento de perímetro',
  'Liquidación de puntos calientes',
  'Protección de viviendas cercanas',
];

function comprimirImagenArchivo(file, maxDim = 900, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('No se pudo procesar la fotografía'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado'));
    reader.readAsDataURL(file);
  });
}

export function IncidenteDetallePanel({
  incidente,
  incidentes = [],
  referencias,
  estaciones = [],
  rolActivo = 'OPERADOR',
  usuarioAutenticado = null,
  brigadas,
  informes,
  evaluacion,
  loading,
  onSeleccionarIncidente,
  onVerEnMapa,
  onVolverAIncidentes,
  onConfirmarRecepcionBrigada,
  onIrABrigadas,
  onIrAZonas,
  onAbrirExpediente,
  onAbrirEstacion,
  onActualizarIncidente,
  onCambiarEstadoIncidente,
  onCerrarIncidente,
  onAsignarBrigada,
  onCambiarEstadoBrigada,
  onDespacharCombo,
  onDespacharUnidad,
  onRetornarUnidad,
  onMovilizarRecurso,
  onLiberarRecurso,
  onCrearInforme,
  onGuardarEvaluacion,
}) {
  const [tabActiva, setTabActiva] = useState(
    rolActivo === 'BOMBERO' ? 'informes' : 'resumen'
  );
  const [gravedadEdit, setGravedadEdit] = useState('MEDIA');
  const [zonaEdit, setZonaEdit] = useState('');

  const [idUnidadSel, setIdUnidadSel] = useState('');
  const [idRecursoSel, setIdRecursoSel] = useState('');
  const [idBombero, setIdBombero] = useState('');
  const [acciones, setAcciones] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [evidencia, setEvidencia] = useState('');
  const [evidenciaError, setEvidenciaError] = useState('');
  const [incluirDanosEnInforme, setIncluirDanosEnInforme] = useState(false);

  const [tipoDano, setTipoDano] = useState('');
  const [nivelDano, setNivelDano] = useState('MODERADO');
  const [costoEstimado, setCostoEstimado] = useState('0');
  const [descDano, setDescDano] = useState('');

  const [modalCierreAbierto, setModalCierreAbierto] = useState(false);
  const [evidenciaAmpliada, setEvidenciaAmpliada] = useState(null);

  const informesPanelRef = useRef(null);
  const accionesInputRef = useRef(null);
  const fotoFileRef = useRef(null);

  useEffect(() => {
    if (incidente) {
      setGravedadEdit(incidente.gravedad || 'MEDIA');
      setZonaEdit(incidente.id_zona ? String(incidente.id_zona) : '');
    }
  }, [incidente]);

  useEffect(() => {
    const authPersonaId = usuarioAutenticado?.id_persona;
    if (!authPersonaId) return;
    if (rolActivo === 'BOMBERO' || usuarioAutenticado?.rol === 'BOMBERO') {
      setIdBombero(String(authPersonaId));
    } else {
      setIdBombero((prev) => prev || String(authPersonaId));
    }
  }, [usuarioAutenticado, rolActivo, incidente?.id_incidente]);

  useEffect(() => {
    if (evaluacion) {
      setTipoDano(evaluacion.tipo_dano || '');
      setNivelDano(evaluacion.nivel_dano || 'MODERADO');
      setCostoEstimado(String(evaluacion.costo_estimado ?? 0));
      setDescDano(evaluacion.descripcion || '');
    } else {
      setTipoDano('');
      setNivelDano('MODERADO');
      setCostoEstimado('0');
      setDescDano('');
    }
  }, [evaluacion, incidente?.id_incidente]);

  if (!incidente) {
    const sugeridos = [...incidentes]
      .sort((a, b) => {
        const actA = a.estado !== 'CERRADO' ? 1 : 0;
        const actB = b.estado !== 'CERRADO' ? 1 : 0;
        if (actA !== actB) return actB - actA;
        return b.id_incidente - a.id_incidente;
      })
      .slice(0, 6);

    return (
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Inspección de Incidente y Despacho</h2>
            <p className="subtitle">
              Selecciona un caso activo o reciente para gestionar su ciclo de vida, despacho e informes.
            </p>
          </div>
          {onVolverAIncidentes && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onVolverAIncidentes}
            >
              Ir a Gestión de Incidentes
            </button>
          )}
        </div>

        {sugeridos.length === 0 ? (
          <p className="empty-text">
            Aún no hay incidentes registrados. Crea uno directo o convierte un aviso en la consola de Triage.
          </p>
        ) : (
          <div className="inc-quick-pick-grid">
            {sugeridos.map((inc) => (
              <article key={inc.id_incidente} className="inc-quick-pick-card">
                <div className="inc-quick-pick-head">
                  <strong>
                    #{inc.id_incidente} — {inc.ubicacion}
                  </strong>
                </div>
                <div className="item-meta">
                  <StatusBadge value={inc.gravedad} />
                  <StatusBadge value={inc.estado} />
                </div>
                {onSeleccionarIncidente && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSeleccionarIncidente(inc.id_incidente)}
                  >
                    Abrir →
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  const esCiudadano = rolActivo === 'CIUDADANO';
  const esOperadorOAdmin = rolActivo === 'OPERADOR' || rolActivo === 'ADMIN';
  const esBombero = rolActivo === 'BOMBERO';
  const puedeEditarOperacion = esOperadorOAdmin || esBombero;

  const personas = referencias?.personas || [];
  const zonas = referencias?.zonas || [];
  const catalogoBrigadas = referencias?.brigadas || [];
  const estacionesGeo = referencias?.estaciones_geo || [];

  const coordsZonaIncidente = incidente.id_zona
    ? zonas.find((z) => z.id_zona === incidente.id_zona)?.coordenadas || null
    : null;
  const coordsIncidente = incidente.coordenadas || coordsZonaIncidente;

  const nombrePersona = (id) => {
    const found = personas.find((p) => p.id_persona === id);
    return found ? `${found.nombre_completo} (#${id})` : id ? `#${id}` : 'N/A';
  };
  const nombreZona = (id) => {
    const found = zonas.find((z) => z.id_zona === id);
    return found ? `${found.nombre} (${found.nivel_riesgo})` : id ? `#${id}` : 'N/A';
  };
  const infoBrigada = (id) => catalogoBrigadas.find((b) => b.id_brigada === id) || null;
  const nombreBrigada = (id) => {
    const found = infoBrigada(id);
    return found ? `${found.nombre} (#${id})` : `Brigada #${id}`;
  };

  const bomberos = personas.filter(
    (p) => p.tipo_persona === 'BOMBERO' || !p.tipo_persona
  );
  const listaBomberos = bomberos.length > 0 ? bomberos : personas;

  const idsBrigadasActivasEnIncidente = new Set(
    brigadas
      .filter((b) => b.estado_asignacion !== 'LIBERADA')
      .map((b) => b.id_brigada)
  );

  const calcDistYEta = (coordsOrigen) => {
    if (!coordsIncidente || !coordsOrigen) {
      return { distanciaKm: null, etaMin: null };
    }
    const dist = Number(haversineKm(coordsIncidente, coordsOrigen).toFixed(1));
    const eta = Math.max(3, Math.round((dist / 35) * 60 + 3));
    return { distanciaKm: dist, etaMin: eta };
  };

  const brigadasEnriquecidas = catalogoBrigadas
    .map((b) => {
      const estaDisponible =
        (b.disponible ?? b.estado === 'ACTIVA') &&
        !idsBrigadasActivasEnIncidente.has(b.id_brigada);
      const { distanciaKm, etaMin } = calcDistYEta(b.estacion_coordenadas);
      return {
        ...b,
        estaDisponible,
        distanciaKm,
        etaMin,
      };
    })
    .sort((a, b) => {
      if (a.estaDisponible !== b.estaDisponible) return a.estaDisponible ? -1 : 1;
      const distA = a.distanciaKm ?? Number.POSITIVE_INFINITY;
      const distB = b.distanciaKm ?? Number.POSITIVE_INFINITY;
      if (distA !== distB) return distA - distB;
      return a.id_brigada - b.id_brigada;
    });

  const brigadasDisponibles = brigadasEnriquecidas.filter((b) => b.estaDisponible);
  const metaBrigadasPorGravedad = {
    BAJA: 1,
    MEDIA: 1,
    ALTA: 2,
    CATASTROFICA: 3,
  };
  const requeridas = metaBrigadasPorGravedad[incidente.gravedad] || 1;
  const coberturaPct = Math.min(
    100,
    Math.round((idsBrigadasActivasEnIncidente.size / requeridas) * 100)
  );
  const faltanBrigadas = Math.max(
    0,
    requeridas - idsBrigadasActivasEnIncidente.size
  );
  const brigadaRecomendada = brigadasDisponibles[0] || null;

  const marcaIncidente = `Incidente #${incidente.id_incidente}`;
  const listaEstaciones = Array.isArray(estaciones) ? estaciones : [];
  const geoPorEstacionId = new Map(
    estacionesGeo.map((e) => [e.id_estacion, e.coordenadas])
  );

  const estacionesOrdenadas = listaEstaciones
    .map((est) => {
      const coords = geoPorEstacionId.get(est.id_estacion) || null;
      const { distanciaKm, etaMin } = calcDistYEta(coords);
      return { ...est, coordenadas: coords, distanciaKm, etaMin };
    })
    .sort((a, b) => {
      const distA = a.distanciaKm ?? Number.POSITIVE_INFINITY;
      const distB = b.distanciaKm ?? Number.POSITIVE_INFINITY;
      if (distA !== distB) return distA - distB;
      return a.id_estacion - b.id_estacion;
    });

  const unidadesDisponibles = estacionesOrdenadas.flatMap((est) =>
    (est.unidades || [])
      .filter((u) => u.estado === 'DISPONIBLE')
      .map((u) => ({
        ...u,
        id_registro: u.id_unidad ?? u.id,
        id_estacion: est.id_estacion,
        estacion_nombre: est.nombre,
        distanciaKm: est.distanciaKm,
        etaMin: est.etaMin,
      }))
  );

  const unidadDeEstacionRecomendada = brigadaRecomendada?.id_estacion
    ? unidadesDisponibles.find(
        (u) => u.id_estacion === brigadaRecomendada.id_estacion
      ) || null
    : null;

  const recursosDisponibles = listaEstaciones.flatMap((est) =>
    (est.recursos || [])
      .filter((r) => r.estado === 'DISPONIBLE' && Number(r.cantidad ?? 1) > 0)
      .map((r) => ({
        ...r,
        id_registro: r.id_recurso ?? r.id,
        id_estacion: est.id_estacion,
        estacion_nombre: est.nombre,
      }))
  );

  const unidadesAsignadas = listaEstaciones.flatMap((est) =>
    (est.unidades || [])
      .filter(
        (u) =>
          u.estado === 'EN_MISION' &&
          String(u.motivo_estado || '').includes(marcaIncidente)
      )
      .map((u) => ({
        ...u,
        id_registro: u.id_unidad ?? u.id,
        id_estacion: est.id_estacion,
        estacion_nombre: est.nombre,
      }))
  );

  const recursosAsignados = listaEstaciones.flatMap((est) =>
    (est.recursos || [])
      .filter(
        (r) =>
          r.estado === 'EN_USO' &&
          String(r.motivo_estado || '').includes(marcaIncidente)
      )
      .map((r) => ({
        ...r,
        id_registro: r.id_recurso ?? r.id,
        id_estacion: est.id_estacion,
        estacion_nombre: est.nombre,
      }))
  );

  const siguientesEstados = (TRANSICIONES_INCIDENTE[incidente.estado] || []).filter(
    (est) => (est === 'CERRADO' ? esOperadorOAdmin : puedeEditarOperacion)
  );

  async function handleClasificar(e) {
    e.preventDefault();
    await onActualizarIncidente(incidente.id_incidente, {
      gravedad: gravedadEdit,
      id_zona: zonaEdit ? Number(zonaEdit) : null,
    });
  }

  async function handleDespacharUnidadSubmit(e) {
    e.preventDefault();
    if (!idUnidadSel || !onDespacharUnidad) return;
    const unidad = unidadesDisponibles.find(
      (u) => String(u.id_registro) === String(idUnidadSel)
    );
    if (!unidad) return;
    await onDespacharUnidad(incidente.id_incidente, unidad, incidente.ubicacion);
    setIdUnidadSel('');
  }

  async function handleMovilizarRecursoSubmit(e) {
    e.preventDefault();
    if (!idRecursoSel || !onMovilizarRecurso) return;
    const recurso = recursosDisponibles.find(
      (r) => String(r.id_registro) === String(idRecursoSel)
    );
    if (!recurso) return;
    await onMovilizarRecurso(incidente.id_incidente, recurso, incidente.ubicacion);
    setIdRecursoSel('');
  }

  const bomberoBloqueado =
    (esBombero || usuarioAutenticado?.rol === 'BOMBERO') &&
    Boolean(usuarioAutenticado?.id_persona);

  const bomberoAutenticadoNombre = usuarioAutenticado?.id_persona
    ? nombrePersona(usuarioAutenticado.id_persona)
    : null;

  const etapaActualIdx = ETAPAS_CICLO.indexOf(incidente.estado);
  const estaCerrado = incidente.estado === 'CERRADO';

  function agregarAccionRapida(textoAccion) {
    setAcciones((prev) => {
      const actual = prev.trim();
      if (!actual) return textoAccion;
      if (actual.toLowerCase().includes(textoAccion.toLowerCase())) return prev;
      return `${actual}. ${textoAccion}`;
    });
    accionesInputRef.current?.focus();
  }

  async function handleArchivoEvidencia(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEvidenciaError('');
    try {
      const dataUrl = await comprimirImagenArchivo(file);
      setEvidencia(dataUrl);
    } catch (err) {
      setEvidenciaError(err.message);
    } finally {
      e.target.value = '';
    }
  }

  async function handleCrearInforme(e) {
    e.preventDefault();
    const idFinal = bomberoBloqueado
      ? Number(usuarioAutenticado.id_persona)
      : Number(idBombero);
    if (!idFinal || !acciones.trim()) return;
    const payload = {
      id_bombero: idFinal,
      acciones: acciones.trim(),
      observaciones: observaciones.trim() || null,
      evidencia: evidencia.trim() || null,
    };
    if (incluirDanosEnInforme && tipoDano.trim()) {
      payload.evaluacion_danos = {
        tipo_dano: tipoDano.trim(),
        nivel_dano: nivelDano,
        costo_estimado: Number(costoEstimado || 0),
        descripcion: descDano.trim() || null,
      };
    }
    await onCrearInforme(incidente.id_incidente, payload);
    if (!bomberoBloqueado) {
      setIdBombero(usuarioAutenticado?.id_persona ? String(usuarioAutenticado.id_persona) : '');
    }
    setAcciones('');
    setObservaciones('');
    setEvidencia('');
    setEvidenciaError('');
    setIncluirDanosEnInforme(false);
  }

  async function handleEvaluacion(e) {
    e.preventDefault();
    if (!tipoDano.trim()) return;
    await onGuardarEvaluacion(
      incidente.id_incidente,
      {
        tipo_dano: tipoDano.trim(),
        nivel_dano: nivelDano,
        costo_estimado: Number(costoEstimado || 0),
        descripcion: descDano.trim() || null,
      },
      Boolean(evaluacion)
    );
  }

  const tabEffective = esCiudadano && tabActiva === 'informes' ? 'resumen' : tabActiva;
  const recursosDesplegadosCount =
    idsBrigadasActivasEnIncidente.size +
    unidadesAsignadas.length +
    recursosAsignados.length;

  const tabs = [
    { id: 'resumen', label: 'Resumen y Estado' },
    {
      id: 'despacho',
      label: 'Despacho y Recursos',
      count: recursosDesplegadosCount,
    },
    ...(!esCiudadano
      ? [
          {
            id: 'informes',
            label: 'Informes y Daños',
            count: informes.length,
            alertDot: informes.length === 0 && !estaCerrado,
          },
        ]
      : []),
  ];

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Incidente #{incidente.id_incidente}</h2>
          <p className="subtitle">{incidente.ubicacion}</p>
        </div>
        <div className="item-actions">
          <StatusBadge value={incidente.gravedad} />
          <StatusBadge value={incidente.estado} />
          {coordsIncidente && onVerEnMapa && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onVerEnMapa(coordsIncidente)}
            >
              📍 Ver en Mapa
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onAbrirExpediente(incidente.id_incidente)}
            disabled={loading}
          >
            Ver Expediente / Acta
          </button>
        </div>
      </div>

      <div className="detail-meta">
        <span>Aviso: {incidente.id_aviso ? `#${incidente.id_aviso}` : 'Directo'}</span>
        <span>Zona: {nombreZona(incidente.id_zona)}</span>
        <span>Operador: {nombrePersona(incidente.id_operador)}</span>
        {incidente.duracion_min != null && (
          <span>Duración: {incidente.duracion_min} min</span>
        )}
        {incidente.fecha_cierre && (
          <span>Cierre: {new Date(incidente.fecha_cierre).toLocaleString()}</span>
        )}
      </div>

      <div className="inc-detail-tabs" role="tablist" aria-label="Secciones del incidente">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tabEffective === tab.id}
            className={`inc-detail-tab ${tabEffective === tab.id ? 'active' : ''}`}
            onClick={() => setTabActiva(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="inc-tab-count">{tab.count}</span>
            )}
            {tab.alertDot && (
              <span
                className="inc-tab-alert-dot"
                title="Falta al menos 1 informe para cierre"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>

      {tabEffective === 'resumen' && (
        <>
          <div className="inc-lifecycle-box" aria-label="Ciclo de vida del incidente">
            <div className="inc-lifecycle-steps">
              {ETAPAS_CICLO.map((etapa, idx) => {
                const completada = etapaActualIdx > idx || (estaCerrado && idx === 3);
                const actual = incidente.estado === etapa;
                return (
                  <div
                    key={etapa}
                    className={`inc-step ${actual ? 'is-current' : ''} ${
                      completada ? 'is-done' : ''
                    }`}
                  >
                    <span className="inc-step-dot" aria-hidden="true">
                      {completada && !actual ? '✓' : idx + 1}
                    </span>
                    <span className="inc-step-label">{etapa}</span>
                  </div>
                );
              })}
            </div>

            {siguientesEstados.length > 0 && (
              <div className="state-actions inc-state-actions">
                <span>Siguiente paso:</span>
                {siguientesEstados.map((est) => (
                  <button
                    key={est}
                    type="button"
                    className={est === 'CERRADO' ? 'btn-danger' : 'btn-secondary'}
                    onClick={() =>
                      est === 'CERRADO'
                        ? setModalCierreAbierto(true)
                        : onCambiarEstadoIncidente(incidente.id_incidente, est)
                    }
                    disabled={loading}
                    title={
                      est === 'CERRADO'
                        ? 'Abrir checklist de cierre oficial'
                        : undefined
                    }
                  >
                    {ETIQUETA_TRANSICION[est] || est}
                    {est === 'CERRADO' && informes.length === 0 ? ' (Falta informe)' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {esOperadorOAdmin && !estaCerrado && (() => {
            const idZonaActual = incidente.id_zona ?? null;
            const idZonaNueva = zonaEdit ? Number(zonaEdit) : null;
            const clasificacionCambiada =
              gravedadEdit !== incidente.gravedad || idZonaNueva !== idZonaActual;

            const zonasConDist = zonas
              .filter((z) => z.estado !== 'Inactiva' || z.id_zona === idZonaActual)
              .map((z) => {
                const dist =
                  coordsIncidente && z.coordenadas
                    ? Number(haversineKm(coordsIncidente, z.coordenadas).toFixed(1))
                    : null;
                return { ...z, distanciaKm: dist };
              });

            return (
              <form className="inc-classify-box" onSubmit={handleClasificar}>
                <div className="inc-classify-head">
                  <strong>Validación y Reclasificación Operativa</strong>
                  <span
                    className={`badge ${
                      clasificacionCambiada ? 'badge-warn' : 'badge-muted'
                    }`}
                  >
                    {clasificacionCambiada ? 'Cambios pendientes' : 'Sin cambios'}
                  </span>
                </div>

                <div className="inc-classify-controls">
                  <div
                    className="inc-gravity-pills"
                    role="group"
                    aria-label="Clasificar gravedad"
                  >
                    {GRAVEDADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`inc-gravity-pill sev-${g.toLowerCase()} ${
                          gravedadEdit === g ? 'active' : ''
                        }`}
                        onClick={() => setGravedadEdit(g)}
                        disabled={loading}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  <div className="inc-classify-zone-row">
                    <select
                      value={zonaEdit}
                      onChange={(e) => setZonaEdit(e.target.value)}
                      aria-label="Asignar zona de riesgo"
                    >
                      <option value="">Sin zona asignada</option>
                      {zonasConDist.map((z) => (
                        <option key={z.id_zona} value={z.id_zona}>
                          {z.nombre} ({z.nivel_riesgo}
                          {z.estado === 'Alerta Emitida' ? ' · 🚨 Alerta COE' : ''})
                          {z.distanciaKm === 0
                            ? ' · Dentro del polígono'
                            : z.distanciaKm != null
                            ? ` · ~${z.distanciaKm} km`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className={clasificacionCambiada ? '' : 'btn-secondary'}
                      disabled={loading || !clasificacionCambiada}
                    >
                      Guardar Clasificación
                    </button>
                  </div>
                </div>
              </form>
            );
          })()}

          <div className="inc-summary-grid">
            <button
              type="button"
              className={`inc-summary-card ${faltanBrigadas > 0 && !estaCerrado ? 'is-warn' : 'is-ok'}`}
              onClick={() => setTabActiva('despacho')}
            >
              <span className="inc-summary-label">Dotación de Brigadas</span>
              <span className="inc-summary-value">
                {idsBrigadasActivasEnIncidente.size} / {requeridas} activas
              </span>
              <span className="inc-summary-hint">
                {faltanBrigadas > 0
                  ? `Faltan ${faltanBrigadas} · Ir a Despacho →`
                  : 'Dotación sugerida cubierta →'}
              </span>
            </button>

            <button
              type="button"
              className="inc-summary-card"
              onClick={() => setTabActiva('despacho')}
            >
              <span className="inc-summary-label">Unidades y Recursos</span>
              <span className="inc-summary-value">
                {unidadesAsignadas.length} unid. · {recursosAsignados.length} rec.
              </span>
              <span className="inc-summary-hint">Desplegados en sitio →</span>
            </button>

            {!esCiudadano && (
              <>
                <button
                  type="button"
                  className={`inc-summary-card ${
                    informes.length === 0 && !estaCerrado ? 'is-warn' : 'is-ok'
                  }`}
                  onClick={() => setTabActiva('informes')}
                >
                  <span className="inc-summary-label">Informes de Campo</span>
                  <span className="inc-summary-value">
                    {informes.length} registrado(s)
                  </span>
                  <span className="inc-summary-hint">
                    {informes.length === 0 && !estaCerrado
                      ? 'Necesario 1 para cierre →'
                      : 'Consultar o redactar →'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`inc-summary-card ${evaluacion ? 'is-ok' : ''}`}
                  onClick={() => setTabActiva('informes')}
                >
                  <span className="inc-summary-label">Evaluación de Daños</span>
                  <span className="inc-summary-value">
                    {evaluacion
                      ? `${evaluacion.nivel_dano} · Bs. ${Number(
                          evaluacion.costo_estimado || 0
                        ).toLocaleString()}`
                      : 'Sin registrar'}
                  </span>
                  <span className="inc-summary-hint">
                    {evaluacion ? 'Editar o ver detalle →' : 'Registrar evaluación →'}
                  </span>
                </button>
              </>
            )}
          </div>

          {(() => {
            const zonaObj = incidente.id_zona
              ? zonas.find((z) => z.id_zona === incidente.id_zona)
              : null;
            if (!zonaObj) return null;
            return (
              <div className="inc-zona-telemetry-box">
                <div className="inc-zona-telemetry-head">
                  <strong>
                    🌲 Condiciones de Zona de Riesgo: {zonaObj.nombre} ({zonaObj.nivel_riesgo})
                  </strong>
                  <div className="item-actions">
                    {zonaObj.estado === 'Alerta Emitida' && (
                      <span className="inc-zona-alerta-badge">🚨 Alerta COE</span>
                    )}
                    {onIrAZonas && (
                      <button
                        type="button"
                        className="btn-secondary btn-xs"
                        onClick={onIrAZonas}
                      >
                        🗺️ Ver en Zonas de Riesgo ↗
                      </button>
                    )}
                  </div>
                </div>
                <div className="inc-zona-telemetry-chips">
                  <span>Vegetación: <b>{zonaObj.tipo_vegetacion}</b></span>
                  {zonaObj.area_hectareas > 0 && (
                    <span>Área: <b>{zonaObj.area_hectareas} ha</b></span>
                  )}
                  <span>🌡️ Temp.: <b>{zonaObj.temperatura} °C</b></span>
                  <span>💧 Humedad: <b>{zonaObj.humedad}%</b></span>
                  <span>💨 Viento: <b>{zonaObj.velocidad_viento} km/h</b></span>
                </div>
                {zonaObj.alerta_preventiva && (
                  <p className="inc-zona-note">
                    <strong>Alerta preventiva ({zonaObj.alerta_preventiva.nivel_alerta}):</strong>{' '}
                    {zonaObj.alerta_preventiva.mensaje}
                  </p>
                )}
                {zonaObj.ultima_inspeccion && (
                  <p className="inc-zona-note">
                    <strong>Última inspección ({zonaObj.ultima_inspeccion.nivel_riesgo_observado}):</strong>{' '}
                    {zonaObj.ultima_inspeccion.observaciones}
                    {zonaObj.ultima_inspeccion.recomendaciones
                      ? ` · Rec.: ${zonaObj.ultima_inspeccion.recomendaciones}`
                      : ''}
                  </p>
                )}
              </div>
            );
          })()}
        </>
      )}

      {tabEffective === 'despacho' && (
      <div className="subgrid">
        <div className="subpanel">
          <div className="inc-dispatch-head">
            <h3>Brigadas Asignadas</h3>
            <div className="item-actions">
              <span className="inc-dispatch-coverage-badge">
                Dotación activa: <strong>{idsBrigadasActivasEnIncidente.size}</strong> / {requeridas} brigada(s)
              </span>
              {onIrABrigadas && (
                <button
                  type="button"
                  className="btn-secondary btn-xs"
                  onClick={() =>
                    onIrABrigadas(esBombero ? '/brigadas/incendios' : '/brigadas')
                  }
                >
                  {esBombero ? 'Incendios Asignados ↗' : 'Gestionar Brigadas ↗'}
                </button>
              )}
            </div>
          </div>

          <div className="inc-dispatch-coverage" aria-label="Cobertura operativa CAD">
            <div className="inc-coverage-track">
              <div
                className={`inc-coverage-fill ${faltanBrigadas === 0 ? 'is-full' : ''}`}
                style={{ width: `${coberturaPct}%` }}
              />
            </div>
            <small>
              {faltanBrigadas > 0
                ? `Falta(n) ${faltanBrigadas} brigada(s) sugerida(s) para gravedad ${incidente.gravedad}.`
                : `Dotación mínima sugerida cubierta para gravedad ${incidente.gravedad}.`}
            </small>
          </div>

          {esOperadorOAdmin && incidente.estado !== 'CERRADO' && (
            <>
              {brigadaRecomendada && (
                <div className="cad-recommend-box">
                  <div className="inc-recommend-info">
                    <strong>⚡ Sugerencia CAD ({incidente.gravedad}):</strong>{' '}
                    <span>
                      <b>{brigadaRecomendada.nombre}</b>
                      {brigadaRecomendada.estacion_nombre &&
                        ` · ${brigadaRecomendada.estacion_nombre}`}
                      {brigadaRecomendada.distanciaKm != null &&
                        ` (~${brigadaRecomendada.distanciaKm} km · ETA ~${brigadaRecomendada.etaMin} min)`}
                    </span>
                    <div className="inc-brigada-meta">
                      <span>
                        👥 {brigadaRecomendada.cantidad_miembros || 0} bomberos
                      </span>
                      {brigadaRecomendada.jefe_cuadrilla && (
                        <span> · Jefe: {brigadaRecomendada.jefe_cuadrilla}</span>
                      )}
                      {unidadDeEstacionRecomendada && (
                        <span>
                          {' '}
                          · Unidad en base: <b>{unidadDeEstacionRecomendada.codigo}</b>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="inc-recommend-actions">
                    {unidadDeEstacionRecomendada && onDespacharCombo ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onDespacharCombo(
                              incidente.id_incidente,
                              brigadaRecomendada,
                              unidadDeEstacionRecomendada,
                              incidente.ubicacion
                            )
                          }
                          disabled={loading}
                        >
                          ⚡ Despachar Brigada + Unidad ({unidadDeEstacionRecomendada.codigo})
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            onAsignarBrigada(incidente.id_incidente, {
                              id_brigada: brigadaRecomendada.id_brigada,
                            })
                          }
                          disabled={loading}
                        >
                          Solo Brigada
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onAsignarBrigada(incidente.id_incidente, {
                            id_brigada: brigadaRecomendada.id_brigada,
                          })
                        }
                        disabled={loading}
                      >
                        ⚡ Despachar Brigada
                      </button>
                    )}
                  </div>
                </div>
              )}

              {brigadasEnriquecidas.length > 0 && (
                <div
                  className="inc-brigada-catalog"
                  aria-label="Catálogo de brigadas para despacho"
                >
                  {brigadasEnriquecidas.map((b) => {
                    const yaEnEste = idsBrigadasActivasEnIncidente.has(b.id_brigada);
                    const ocupadaOtro =
                      !yaEnEste && b.ocupada_en_incidente != null;
                    const estadoClase = b.estaDisponible
                      ? 'is-available'
                      : ocupadaOtro || yaEnEste
                      ? 'is-busy'
                      : 'is-inactive';

                    return (
                      <div
                        key={b.id_brigada}
                        className={`inc-brigada-card ${estadoClase}`}
                      >
                        <div className="inc-brigada-card-main">
                          <div className="inc-brigada-title">
                            <span
                              className={`inc-status-dot ${estadoClase}`}
                              aria-hidden="true"
                            />
                            <strong>{b.nombre}</strong>
                            <span
                              className={`re-estado bg-estado-${claseEstadoBrigada(
                                b.estado
                              )}`}
                            >
                              <i className="vg-punto" /> {etiquetaEstadoBrigada(b.estado)}
                            </span>
                            {b.distanciaKm != null && (
                              <span className="inc-dist-pill">
                                ~{b.distanciaKm} km · ETA ~{b.etaMin}m
                              </span>
                            )}
                          </div>
                          <div className="inc-brigada-meta">
                            <span>
                              {b.estacion_nombre || 'Sin estación vinculada'}
                            </span>
                            <span>
                              · 👥 {b.cantidad_miembros ?? 0} bomberos
                              {b.jefe_cuadrilla ? ` · Jefe: ${b.jefe_cuadrilla}` : ''}
                            </span>
                            {(b.cantidad_miembros ?? 0) === 0 && (
                              <span className="inc-brigada-warn-chip">
                                ⚠️ Sin integrantes activos
                              </span>
                            )}
                            {(b.invitaciones_pendientes ?? 0) > 0 && (
                              <span className="inc-brigada-warn-chip">
                                📩 {b.invitaciones_pendientes} invitación(es) pendiente(s)
                              </span>
                            )}
                            {!b.estaDisponible && (
                              <span className="inc-brigada-reason">
                                ·{' '}
                                {yaEnEste
                                  ? 'Ya asignada a este incidente'
                                  : ocupadaOtro
                                  ? `Ocupada en Incidente #${b.ocupada_en_incidente}`
                                  : `${etiquetaEstadoBrigada(b.estado)}${
                                      b.motivo_estado ? ` (${b.motivo_estado})` : ''
                                    }`}
                              </span>
                            )}
                          </div>
                          {Array.isArray(b.miembros) && b.miembros.length > 0 && (
                            <div className="inc-brigada-roles-row">
                              {b.miembros
                                .map(
                                  (m) =>
                                    `${m.nombre_completo} (${etiquetaRolBrigada(
                                      m.rol_en_brigada
                                    )})`
                                )
                                .join(' · ')}
                            </div>
                          )}
                        </div>
                        <div className="item-actions">
                          {b.estaDisponible ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                onAsignarBrigada(incidente.id_incidente, {
                                  id_brigada: b.id_brigada,
                                })
                              }
                              disabled={loading}
                            >
                              Asignar
                            </button>
                          ) : (
                            <span className="badge badge-muted">
                              {yaEnEste
                                ? 'Activa aquí'
                                : ocupadaOtro
                                ? `#${b.ocupada_en_incidente}`
                                : etiquetaEstadoBrigada(b.estado)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <div className="list-stack">
            {brigadas.length === 0 ? (
              <p className="empty-text">Sin brigadas asignadas.</p>
            ) : (
              brigadas.map((b) => {
                const next = TRANSICIONES_BRIGADA[b.estado_asignacion] || [];
                const meta = infoBrigada(b.id_brigada);
                const pasoIdx = PASOS_BRIGADA.indexOf(b.estado_asignacion);
                const liberada = b.estado_asignacion === 'LIBERADA';
                const estAsig = estadoAsignacion(b.estado_asignacion);
                const esJefeAqui =
                  Boolean(usuarioAutenticado?.id_persona) &&
                  meta?.jefe_cuadrilla_id === usuarioAutenticado.id_persona;

                return (
                  <div
                    key={`${b.id_brigada}-${b.fecha_asignacion}`}
                    className="item-row compact"
                  >
                    <div className="inc-brigada-assigned-main">
                      <div>
                        <strong>{nombreBrigada(b.id_brigada)}</strong>{' '}
                        <span className={`re-estado bg-estado-${estAsig.clase}`}>
                          <i className="vg-punto" /> {estAsig.etiqueta}
                        </span>
                      </div>
                      {meta && (
                        <div className="inc-brigada-meta">
                          {meta.estacion_nombre && (
                            <span>{meta.estacion_nombre} · </span>
                          )}
                          <span>
                            👥 {meta.cantidad_miembros ?? 0} bomberos
                            {meta.jefe_cuadrilla ? ` · Jefe: ${meta.jefe_cuadrilla}` : ''}
                          </span>
                        </div>
                      )}
                      {!liberada && (
                        <div>
                          <span
                            className={`inc-brigada-confirm-chip ${
                              b.estado_asignacion === 'ASIGNADA'
                                ? 'is-pending'
                                : 'is-confirmed'
                            }`}
                          >
                            {b.estado_asignacion === 'ASIGNADA'
                              ? '⏳ Pendiente de confirmación del jefe de cuadrilla'
                              : '✓ Recepción confirmada por cuadrilla'}
                          </span>
                        </div>
                      )}
                      {!liberada && (
                        <div
                          className="inc-brigada-progress"
                          aria-label="Progreso de despliegue de brigada"
                        >
                          {PASOS_BRIGADA.map((paso, idx) => (
                            <span
                              key={paso}
                              className={`inc-bp-step ${
                                idx <= pasoIdx ? 'is-done' : ''
                              } ${idx === pasoIdx ? 'is-current' : ''}`}
                            >
                              {paso.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!estaCerrado && (
                      <div className="item-actions">
                        {onConfirmarRecepcionBrigada &&
                          b.estado_asignacion === 'ASIGNADA' &&
                          esJefeAqui && (
                            <button
                              type="button"
                              onClick={() =>
                                onConfirmarRecepcionBrigada(
                                  incidente.id_incidente,
                                  b.id_brigada
                                )
                              }
                              disabled={loading}
                            >
                              ✓ Confirmar recepción (En camino)
                            </button>
                          )}
                        {puedeEditarOperacion &&
                          next.map((st) => (
                            <button
                              key={st}
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                onCambiarEstadoBrigada(
                                  incidente.id_incidente,
                                  b.id_brigada,
                                  st
                                )
                              }
                              disabled={loading}
                            >
                              {ETIQUETAS_TRANSICION_BRIGADA[st] || st}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {!esCiudadano && (
          <div className="subpanel">
            <h3>
              Unidades Móviles y Recursos (Estaciones)
            </h3>

            {estacionesOrdenadas.length > 0 && onAbrirEstacion && (
              <div className="inc-estaciones-chips">
                {estacionesOrdenadas.map((est) => {
                  const dispU = (est.unidades || []).filter(
                    (u) => u.estado === 'DISPONIBLE'
                  ).length;
                  return (
                    <button
                      key={est.id_estacion}
                      type="button"
                      className="inc-estacion-chip"
                      onClick={() => onAbrirEstacion(est.id_estacion)}
                      title={`Ver ficha de ${est.nombre}`}
                    >
                      <Icono nombre="estacion" tamano={14} />
                      <span>{est.nombre}</span>
                      <small>
                        {est.distanciaKm != null ? `~${est.distanciaKm} km · ` : ''}
                        {dispU} en base
                      </small>
                    </button>
                  );
                })}
              </div>
            )}

            {esOperadorOAdmin && incidente.estado !== 'CERRADO' && (
              <div className="inc-recurso-forms">
                <form className="inline-form" onSubmit={handleDespacharUnidadSubmit}>
                  <select
                    value={idUnidadSel}
                    onChange={(e) => setIdUnidadSel(e.target.value)}
                    aria-label="Seleccionar unidad móvil en base"
                    disabled={loading || unidadesDisponibles.length === 0}
                  >
                    <option value="">
                      {unidadesDisponibles.length === 0
                        ? 'Sin unidades en base disponibles'
                        : `Despachar unidad móvil (${unidadesDisponibles.length} disp.)`}
                    </option>
                    {unidadesDisponibles.map((u) => (
                      <option key={u.id_registro} value={u.id_registro}>
                        {u.codigo} · {u.tipo} — {u.estacion_nombre}
                        {u.distanciaKm != null ? ` (~${u.distanciaKm} km)` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={loading || !idUnidadSel}
                  >
                    Despachar
                  </button>
                </form>

                <form className="inline-form" onSubmit={handleMovilizarRecursoSubmit}>
                  <select
                    value={idRecursoSel}
                    onChange={(e) => setIdRecursoSel(e.target.value)}
                    aria-label="Seleccionar recurso de estación"
                    disabled={loading || recursosDisponibles.length === 0}
                  >
                    <option value="">
                      {recursosDisponibles.length === 0
                        ? 'Sin recursos disponibles'
                        : `Movilizar recurso (${recursosDisponibles.length} disp.)`}
                    </option>
                    {recursosDisponibles.map((r) => (
                      <option key={r.id_registro} value={r.id_registro}>
                        {r.nombre} ({r.cantidad}) — {r.estacion_nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn-secondary"
                    disabled={loading || !idRecursoSel}
                  >
                    Movilizar
                  </button>
                </form>
              </div>
            )}

            <div className="list-stack">
              {unidadesAsignadas.length === 0 && recursosAsignados.length === 0 ? (
                <p className="empty-text">
                  Sin unidades móviles ni recursos de estación desplegados en este incidente
                  {listaEstaciones.length > 0
                    ? ` (${unidadesDisponibles.length} unidades en base y ${recursosDisponibles.length} lotes disponibles).`
                    : '.'}
                </p>
              ) : (
                <>
                  {unidadesAsignadas.map((u) => {
                    const estMeta = estadoUnidad(u.estado);
                    return (
                      <div key={`u-${u.id_registro}`} className="item-row compact">
                        <div className="inc-recurso-row-main">
                          <span className="inc-recurso-ico">
                            <Icono nombre="automovil" tamano={16} />
                          </span>
                          <div>
                            <strong>
                              Unidad {u.codigo} ({u.tipo})
                            </strong>
                            <div className="item-meta">
                              <span className={`re-estado ${estMeta.clase}`}>
                                <i className="vg-punto" /> {estMeta.etiqueta}
                              </span>
                              <span className="inc-recurso-est">{u.estacion_nombre}</span>
                            </div>
                          </div>
                        </div>
                        {puedeEditarOperacion && onRetornarUnidad && (
                          <div className="item-actions">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                onRetornarUnidad(incidente.id_incidente, u)
                              }
                              disabled={loading}
                            >
                              Retornar a base
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {recursosAsignados.map((r) => {
                    const estMeta = estadoRecurso(r.estado);
                    return (
                      <div key={`r-${r.id_registro}`} className="item-row compact">
                        <div className="inc-recurso-row-main">
                          <span className="inc-recurso-ico">
                            <Icono nombre={iconoRecurso(r.tipo_recurso)} tamano={16} />
                          </span>
                          <div>
                            <strong>
                              {r.nombre} (cant. {r.cantidad})
                            </strong>
                            <div className="item-meta">
                              <span className={`re-estado ${estMeta.clase}`}>
                                <i className="vg-punto" /> {estMeta.etiqueta}
                              </span>
                              <span className="inc-recurso-est">{r.estacion_nombre}</span>
                            </div>
                          </div>
                        </div>
                        {puedeEditarOperacion && onLiberarRecurso && (
                          <div className="item-actions">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                onLiberarRecurso(incidente.id_incidente, r)
                              }
                              disabled={loading}
                            >
                              Liberar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {tabEffective === 'informes' && !esCiudadano && (
        <div className="subgrid">
          <div className="subpanel" ref={informesPanelRef}>
            <h3>Informes de Campo</h3>
            {estaCerrado ? (
              <div className="inc-locked-banner">
                Expediente cerrado — no se admiten nuevos informes de campo (modo solo lectura).
              </div>
            ) : (
              <form className="form-stack" onSubmit={handleCrearInforme}>
                {bomberoBloqueado ? (
                  <div className="inc-bombero-chip">
                    <span>Reportando en sesión como:</span>
                    <strong>{bomberoAutenticadoNombre}</strong>
                  </div>
                ) : (
                  <select
                    value={idBombero}
                    onChange={(e) => setIdBombero(e.target.value)}
                    required
                  >
                    <option value="">Seleccionar bombero responsable *</option>
                    {listaBomberos.map((p) => (
                      <option key={p.id_persona} value={p.id_persona}>
                        {p.nombre_completo} (#{p.id_persona})
                      </option>
                    ))}
                  </select>
                )}

                <div className="obs-chips" role="group" aria-label="Plantillas rápidas de acción">
                  {ACCIONES_CAMPO_RAPIDAS.map((txt) => (
                    <button
                      key={txt}
                      type="button"
                      className="obs-chip"
                      onClick={() => agregarAccionRapida(txt)}
                      disabled={loading}
                    >
                      + {txt}
                    </button>
                  ))}
                </div>

                <input
                  ref={accionesInputRef}
                  type="text"
                  placeholder="Acciones realizadas en terreno *"
                  value={acciones}
                  onChange={(e) => setAcciones(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="Observaciones adicionales (opcional)"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                />

                <div className="inc-evidence-composer">
                  <div className="inline-form" style={{ marginBottom: 0 }}>
                    <input
                      type="text"
                      placeholder="Referencia / URL de evidencia o adjunta foto →"
                      value={
                        evidencia.startsWith('data:image/')
                          ? 'Fotografía comprimida lista para enviar'
                          : evidencia
                      }
                      onChange={(e) => {
                        if (!evidencia.startsWith('data:image/')) {
                          setEvidencia(e.target.value);
                        }
                      }}
                      readOnly={evidencia.startsWith('data:image/')}
                    />
                    <input
                      ref={fotoFileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only-input"
                      onChange={handleArchivoEvidencia}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => fotoFileRef.current?.click()}
                      disabled={loading}
                    >
                      📷 Foto de campo
                    </button>
                    {evidencia && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setEvidencia('')}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  {evidenciaError && (
                    <p className="field-error">{evidenciaError}</p>
                  )}
                  {/^(https?:\/\/|data:image\/)/i.test(evidencia.trim()) && (
                    <img
                      src={evidencia.trim()}
                      alt="Vista previa de evidencia"
                      className="evidence-thumb"
                    />
                  )}
                </div>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={incluirDanosEnInforme}
                    onChange={(e) => setIncluirDanosEnInforme(e.target.checked)}
                  />
                  <span>
                    Incluir evaluación de daños en este informe
                  </span>
                </label>

                {incluirDanosEnInforme && (
                  <div className="embedded-danos">
                    <input
                      type="text"
                      placeholder="Tipo de daño *"
                      value={tipoDano}
                      onChange={(e) => setTipoDano(e.target.value)}
                      required
                    />
                    <select
                      value={nivelDano}
                      onChange={(e) => setNivelDano(e.target.value)}
                    >
                      {NIVELES_DANO.map((n) => (
                        <option key={n} value={n}>
                          Nivel: {n}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Costo estimado"
                      value={costoEstimado}
                      onChange={(e) => setCostoEstimado(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Descripción del daño"
                      value={descDano}
                      onChange={(e) => setDescDano(e.target.value)}
                    />
                  </div>
                )}

                <button type="submit" disabled={loading}>
                  Registrar Informe
                </button>
              </form>
            )}

            <div className="list-stack">
              {informes.length === 0 ? (
                <p className="empty-text">
                  Sin informes registrados (necesario al menos 1 para cerrar).
                </p>
              ) : (
                informes.map((inf) => {
                  const esImg =
                    typeof inf.evidencia === 'string' &&
                    /^(https?:\/\/|data:image\/)/i.test(inf.evidencia.trim());
                  return (
                    <div key={inf.id_informe} className="item-row compact">
                      <div>
                        <strong>{nombrePersona(inf.id_bombero)}</strong>: {inf.acciones}
                        {inf.observaciones && (
                          <p className="item-desc">Obs: {inf.observaciones}</p>
                        )}
                        {inf.evidencia && (
                          <div className="evidence-inline">
                            {!esImg && (
                              <span className="item-desc">Evidencia: {inf.evidencia}</span>
                            )}
                            {esImg && (
                              <button
                                type="button"
                                className="photo-zoom-trigger"
                                onClick={() =>
                                  setEvidenciaAmpliada({
                                    src: inf.evidencia.trim(),
                                    title: `Evidencia Informe #${inf.id_informe} — ${nombrePersona(
                                      inf.id_bombero
                                    )}`,
                                  })
                                }
                              >
                                <img
                                  src={inf.evidencia.trim()}
                                  alt={`Evidencia informe ${inf.id_informe}`}
                                  className="evidence-thumb"
                                />
                              </button>
                            )}
                          </div>
                        )}
                        {inf.fecha_hora && (
                          <p className="item-desc">
                            {new Date(inf.fecha_hora).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="subpanel">
            <h3>Evaluación de Daños</h3>
            {estaCerrado ? (
              evaluacion ? (
                <div className="inc-locked-summary">
                  <span>
                    <strong>Tipo:</strong> {evaluacion.tipo_dano}
                  </span>
                  <span>
                    <strong>Nivel:</strong> <StatusBadge value={evaluacion.nivel_dano} />
                  </span>
                  <span>
                    <strong>Costo estimado:</strong> Bs.{' '}
                    {Number(evaluacion.costo_estimado || 0).toLocaleString()}
                  </span>
                  {evaluacion.descripcion && (
                    <span>
                      <strong>Detalle:</strong> {evaluacion.descripcion}
                    </span>
                  )}
                </div>
              ) : (
                <p className="empty-text">
                  Sin evaluación de daños registrada (expediente cerrado).
                </p>
              )
            ) : (
              <form className="form-grid" onSubmit={handleEvaluacion}>
                <input
                  type="text"
                  placeholder="Tipo de daño *"
                  value={tipoDano}
                  onChange={(e) => setTipoDano(e.target.value)}
                  required
                />
                <select value={nivelDano} onChange={(e) => setNivelDano(e.target.value)}>
                  {NIVELES_DANO.map((n) => (
                    <option key={n} value={n}>
                      Nivel: {n}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Costo estimado"
                  value={costoEstimado}
                  onChange={(e) => setCostoEstimado(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Descripción del daño"
                  value={descDano}
                  onChange={(e) => setDescDano(e.target.value)}
                />
                <button type="submit" disabled={loading}>
                  {evaluacion ? 'Actualizar Evaluación' : 'Registrar Evaluación'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <CerrarIncidenteModal
        abierto={modalCierreAbierto}
        incidente={incidente}
        informes={informes}
        evaluacion={evaluacion}
        brigadasActivasCount={idsBrigadasActivasEnIncidente.size}
        unidadesEnMisionCount={unidadesAsignadas.length}
        recursosEnUsoCount={recursosAsignados.length}
        loading={loading}
        onClose={() => setModalCierreAbierto(false)}
        onIrAInformes={() => {
          setTabActiva('informes');
          setTimeout(() => {
            informesPanelRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
            accionesInputRef.current?.focus();
          }, 120);
        }}
        onConfirmarCierre={async (abrirActa) => {
          await onCerrarIncidente(incidente.id_incidente, abrirActa);
          setModalCierreAbierto(false);
        }}
      />

      {evidenciaAmpliada && (
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setEvidenciaAmpliada(null)}
        >
          <div className="lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <strong>{evidenciaAmpliada.title}</strong>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEvidenciaAmpliada(null)}
              >
                Cerrar ✕
              </button>
            </div>
            <img
              src={evidenciaAmpliada.src}
              alt={evidenciaAmpliada.title}
              className="lightbox-img"
            />
          </div>
        </div>
      )}
    </section>
  );
}
