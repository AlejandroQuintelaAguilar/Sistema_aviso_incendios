/**
 * Utilidades geoespaciales, clustering por zoom, polígonos de perímetro
 * y construcción de telemetría para el mapa táctico y su drawer lateral.
 */

export const RADIO_IMPACTO_M = {
  BAJA: 300,
  MEDIA: 700,
  ALTA: 1500,
  CATASTROFICA: 3000,
};

const CONTENCION_BASE = {
  PENDIENTE: 0,
  VERIFICADO: 12,
  ACTIVO: 24,
  CONTROLADO: 78,
  EXTINGUIDO: 96,
  CERRADO: 100,
  DESCARTADO: 100,
};

const TELEMETRIA_SEVERIDAD = {
  BAJO: { frp: 7, tempC: 285, haBase: 1.8 },
  BAJA: { frp: 8, tempC: 295, haBase: 2.4 },
  MEDIO: { frp: 19, tempC: 410, haBase: 6.5 },
  MEDIA: { frp: 22, tempC: 430, haBase: 8.2 },
  ALTO: { frp: 48, tempC: 590, haBase: 24.5 },
  ALTA: { frp: 54, tempC: 620, haBase: 31.0 },
  CRITICO: { frp: 96, tempC: 760, haBase: 64.0 },
  CATASTROFICA: { frp: 138, tempC: 840, haBase: 112.0 },
};

export const RANGOS_FRP_SATELITE = [
  {
    id: 'bajo',
    rangoLabel: '< 5 MW',
    peligroLabel: 'Quema pequeña',
    detalle: 'Foco incipiente, rastrojo o brasa residual',
    min: 0,
    max: 5,
    color: '#eab308',
  },
  {
    id: 'moderado',
    rangoLabel: '5 – 15 MW',
    peligroLabel: 'Foco moderado',
    detalle: 'Chaqueo o pastizal activo en vigilancia',
    min: 5,
    max: 15,
    color: '#f97316',
  },
  {
    id: 'fuerte',
    rangoLabel: '15 – 45 MW',
    peligroLabel: 'Incendio fuerte',
    detalle: 'Frente en expansión — atención prioritaria',
    min: 15,
    max: 45,
    color: '#ef4444',
  },
  {
    id: 'extremo',
    rangoLabel: '≥ 45 MW',
    peligroLabel: 'Emergencia crítica',
    detalle: 'Gran frente de alta energía — riesgo severo',
    min: 45,
    max: Infinity,
    color: '#dc2626',
  },
];

export function clasificarRangoFrp(frpMw) {
  const valor = Number(frpMw) || 0;
  if (valor >= 45) return RANGOS_FRP_SATELITE[3];
  if (valor >= 15) return RANGOS_FRP_SATELITE[2];
  if (valor >= 5) return RANGOS_FRP_SATELITE[1];
  return RANGOS_FRP_SATELITE[0];
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const sLat = Math.sin(dLat / 2);
  const sLng = Math.sin(dLng / 2);
  const h =
    sLat * sLat +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * sLng * sLng;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatHoraCorta(isoStr) {
  if (!isoStr) return 'Sin registro';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return 'Sin registro';
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatFechaHora(isoStr) {
  if (!isoStr) return 'Sin registro';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return 'Sin registro';
  return dt.toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Agrupa focos cercanos según el nivel de zoom actual.
 * A zoom <= 12 agrupa puntos cercanos; a zoom >= 13 los devuelve desglosados.
 */
export function agruparFocosPorZoom(focos, zoom) {
  if (!Array.isArray(focos) || focos.length === 0) return [];
  if (zoom >= 13) {
    return focos.map((foco) => ({
      id: `${foco.kind}-${foco.id}`,
      esCluster: false,
      coords: foco.coords,
      items: [foco],
      foco,
    }));
  }

  const radioKm =
    zoom <= 8 ? 24 : zoom === 9 ? 14 : zoom === 10 ? 7.5 : zoom === 11 ? 3.5 : 1.5;

  const visitados = new Set();
  const resultado = [];

  for (let i = 0; i < focos.length; i += 1) {
    if (visitados.has(i)) continue;
    visitados.add(i);
    const semilla = focos[i];
    const grupo = [semilla];

    for (let j = i + 1; j < focos.length; j += 1) {
      if (visitados.has(j)) continue;
      if (haversineKm(semilla.coords, focos[j].coords) <= radioKm) {
        visitados.add(j);
        grupo.push(focos[j]);
      }
    }

    if (grupo.length === 1) {
      resultado.push({
        id: `${semilla.kind}-${semilla.id}`,
        esCluster: false,
        coords: semilla.coords,
        items: grupo,
        foco: semilla,
      });
    } else {
      const lat =
        grupo.reduce((sum, item) => sum + item.coords.lat, 0) / grupo.length;
      const lng =
        grupo.reduce((sum, item) => sum + item.coords.lng, 0) / grupo.length;
      const tieneCritico = grupo.some((item) => item.esCritico);
      const incCount = grupo.filter((item) => item.kind === 'incidente').length;
      const avCount = grupo.length - incCount;

      resultado.push({
        id: `cluster-${grupo.map((g) => `${g.kind[0]}${g.id}`).join('-')}`,
        esCluster: true,
        coords: { lat, lng },
        items: grupo,
        tieneCritico,
        incCount,
        avCount,
        bounds: grupo.map((g) => [g.coords.lat, g.coords.lng]),
      });
    }
  }

  return resultado;
}

/**
 * Agrupa focos satelitales NASA FIRMS en una grilla espacial O(N) para renderizado
 * fluido a escala nacional y recorta por viewport al acercar (zoom >= 12).
 */
export function agruparSatelitePorGrilla(focos, zoom, viewportBounds = null) {
  if (!Array.isArray(focos) || focos.length === 0) return [];

  let lista = focos;
  if (zoom >= 12) {
    if (viewportBounds) {
      const margen = 0.06;
      lista = focos.filter((f) => {
        const c = f.coordenadas;
        return (
          c &&
          c.lat >= viewportBounds.south - margen &&
          c.lat <= viewportBounds.north + margen &&
          c.lng >= viewportBounds.west - margen &&
          c.lng <= viewportBounds.east + margen
        );
      });
    }
    if (lista.length <= 180) {
      return lista
        .filter((foco) => foco.coordenadas)
        .map((foco) => ({
          id: `sat-${foco.id_foco}`,
          esCluster: false,
          foco,
          coords: foco.coordenadas,
        }));
    }
  }

  const cellDeg =
    zoom <= 5
      ? 0.95
      : zoom === 6
      ? 0.58
      : zoom === 7
      ? 0.32
      : zoom === 8
      ? 0.17
      : zoom === 9
      ? 0.085
      : zoom === 10
      ? 0.042
      : zoom === 11
      ? 0.022
      : 0.012;

  const celdas = new Map();
  for (let i = 0; i < lista.length; i += 1) {
    const f = lista[i];
    const c = f.coordenadas;
    if (!c) continue;
    const gx = Math.floor(c.lng / cellDeg);
    const gy = Math.floor(c.lat / cellDeg);
    const key = `${gx}:${gy}`;
    let cell = celdas.get(key);
    if (!cell) {
      cell = {
        key,
        items: [],
        sumLat: 0,
        sumLng: 0,
        minLat: c.lat,
        maxLat: c.lat,
        minLng: c.lng,
        maxLng: c.lng,
        maxFrp: 0,
        altaCount: 0,
        sinReporteCount: 0,
        departamento: f.departamento || 'Bolivia',
      };
      celdas.set(key, cell);
    }
    cell.items.push(f);
    cell.sumLat += c.lat;
    cell.sumLng += c.lng;
    if (c.lat < cell.minLat) cell.minLat = c.lat;
    if (c.lat > cell.maxLat) cell.maxLat = c.lat;
    if (c.lng < cell.minLng) cell.minLng = c.lng;
    if (c.lng > cell.maxLng) cell.maxLng = c.lng;
    if ((f.frp_mw || 0) > cell.maxFrp) cell.maxFrp = f.frp_mw || 0;
    if (f.confianza === 'ALTA') cell.altaCount += 1;
    if (f.correlacion === 'FOCO_NO_REPORTADO') cell.sinReporteCount += 1;
  }

  const resultado = [];
  celdas.forEach((cell) => {
    const count = cell.items.length;
    if (count === 1) {
      const unico = cell.items[0];
      resultado.push({
        id: `sat-${unico.id_foco}`,
        esCluster: false,
        foco: unico,
        coords: unico.coordenadas,
      });
    } else {
      resultado.push({
        id: `sat-cluster-${cell.key}`,
        esCluster: true,
        count,
        coords: {
          lat: cell.sumLat / count,
          lng: cell.sumLng / count,
        },
        maxFrp: Number(cell.maxFrp.toFixed(1)),
        altaCount: cell.altaCount,
        sinReporteCount: cell.sinReporteCount,
        departamento: cell.departamento,
        bounds: [
          [cell.minLat, cell.minLng],
          [cell.maxLat, cell.maxLng],
        ],
      });
    }
  });
  return resultado;
}

/**
 * Genera el polígono del perímetro afectado usando coordenadas explícitas si existen
 * o un polígono orgánico estimado alrededor del foco.
 */
export function generarPerimetroPoligono(
  coords,
  radiusM = 700,
  seed = 1,
  perimetroExplicito = null
) {
  if (Array.isArray(perimetroExplicito) && perimetroExplicito.length >= 3) {
    return perimetroExplicito.map((p) =>
      Array.isArray(p) ? p : [p.lat, p.lng]
    );
  }
  if (!coords) return [];

  const latFactor = 1 / 111320;
  const lngFactor = 1 / (111320 * Math.cos((coords.lat * Math.PI) / 180));
  const vertices = 14;
  const puntos = [];

  for (let i = 0; i < vertices; i += 1) {
    const theta = (i / vertices) * Math.PI * 2;
    const ripple = 0.84 + 0.2 * Math.sin(theta * 3 + seed * 1.7);
    const distM = radiusM * ripple;
    const dLat = Math.cos(theta) * distM * latFactor;
    const dLng = Math.sin(theta) * distM * lngFactor;
    puntos.push([
      Number((coords.lat + dLat).toFixed(6)),
      Number((coords.lng + dLng).toFixed(6)),
    ]);
  }

  return puntos;
}

export function tooltipHtmlFoco({ titulo, ubicacion, estado, actualizadoIso }) {
  return `<div class="tac-tt-inner">
    <div class="tac-tt-title">${escapeHtml(titulo)}</div>
    <div class="tac-tt-loc">${escapeHtml(ubicacion || 'Sector georreferenciado')}</div>
    <div class="tac-tt-meta">
      <span class="tac-tt-badge">${escapeHtml(estado)}</span>
      <span class="tac-tt-time">Act. ${escapeHtml(formatHoraCorta(actualizadoIso))}</span>
    </div>
  </div>`;
}

/**
 * Construye las secciones del panel lateral / bottom sheet.
 */
export function construirFocoDetalle({
  foco,
  zonas = [],
  informes = [],
  avisos = [],
}) {
  if (!foco) return null;

  if (foco.kind === 'satelite') {
    const raw = foco.raw || {};
    const coords = foco.coords || raw.coordenadas;
    const infoFrp = clasificarRangoFrp(raw.frp_mw);
    const estadoSat =
      raw.correlacion === 'FOCO_NO_REPORTADO'
        ? 'SIN REPORTE'
        : raw.correlacion === 'AVISO_EN_TRIAGE'
        ? 'EN TRIAGE'
        : 'EN INCIDENTE';

    const corrTexto = raw.incidente_cercano
      ? `Coincide con Incidente #${raw.incidente_cercano.id_incidente} (a ${raw.incidente_cercano.distancia_km} km).`
      : raw.aviso_cercano
      ? `Respalda al Aviso #${raw.aviso_cercano.id_aviso} en cola de triage (a ${raw.aviso_cercano.distancia_km} km).`
      : 'No existen avisos ciudadanos ni incidentes registrados a ≤ 3 km de esta lectura orbital.';

    const historialSat = [
      {
        hora: raw.fecha_hora_local || formatFechaHora(raw.fecha_hora_utc) || 'Reciente',
        titulo: `Anomalía térmica captada por ${raw.satelite || 'NOAA-20'}`,
        detalle: `Confianza ${raw.confianza || 'NOMINAL'} · Píxel ${
          raw.resolucion_pixel || '0.38×0.38 km'
        } · Potencia ${raw.frp_mw ?? 0} MW`,
        fuente: `NASA FIRMS · ${raw.sensor || 'VIIRS_NOAA20_NRT'}`,
      },
    ];

    if (raw.incidente_cercano || raw.aviso_cercano) {
      historialSat.push({
        hora: 'Cruce CAD',
        titulo: raw.incidente_cercano
          ? `Vinculado geográficamente a Incidente #${raw.incidente_cercano.id_incidente}`
          : `Confirmación satelital de Aviso #${raw.aviso_cercano.id_aviso}`,
        detalle: corrTexto,
        fuente: 'Correlación Haversine ≤ 3 km',
      });
    }

    return {
      cabecera: {
        titulo: `Anomalía Satelital ${raw.instrumento || 'VIIRS'}`,
        subtitulo: `${raw.satelite || 'NOAA-20'} · Pasada ${raw.pasada || 'DIURNA'}`,
        estado: estadoSat,
        nivelAlerta: raw.nivel_urgencia_sugerido || 'ALTO',
        ubicacion: raw.zona_cercana
          ? `Sector ${raw.zona_cercana.nombre} (~${raw.zona_cercana.distancia_km} km)`
          : raw.departamento
          ? `Departamento de ${raw.departamento} — Bolivia`
          : 'Territorio Nacional — Bolivia',
        lat: coords?.lat,
        lng: coords?.lng,
        alertaSla: false,
        fuenteDato: `NASA FIRMS · ${raw.sensor || 'VIIRS_NOAA20_NRT'}`,
        fotoUrl: null,
        descripcion: `Nivel térmico: ${infoFrp.peligroLabel} (${
          raw.frp_mw ?? 0
        } MW). Confianza ${raw.confianza || 'NOMINAL'} · Píxel ${
          raw.resolucion_pixel || '0.38×0.38 km'
        }. ${corrTexto}`,
      },
      metricas: {
        hectareas: Number(Math.max(1.2, (raw.frp_mw || 10) * 0.45).toFixed(1)),
        hectareasEsEstimado: true,
        contencionPct: raw.incidente_cercano ? 30 : 0,
        frpMw: raw.frp_mw ?? 0,
        temperaturaFocoC: raw.temperatura_brillo_c ?? 85,
      },
      historial: historialSat,
    };
  }

  const isIncidente = foco.kind === 'incidente';
  const raw = foco.raw || {};
  const coords = foco.coords;
  const seed = Number(foco.id || 1);

  const zonaObj = zonas.find((z) => z.id_zona === raw.id_zona);
  const zonaNombre =
    zonaObj?.nombre ||
    raw.zona_sugerida?.nombre ||
    (isIncidente ? 'Zona operativa asignada' : 'Sector en evaluación');

  const nivelAlerta = isIncidente
    ? raw.gravedad || 'MEDIA'
    : foco.kind === 'grupo'
    ? raw.nivel_urgencia_max || 'ALTO'
    : raw.nivel_urgencia || 'MEDIO';

  const estado = isIncidente
    ? raw.estado || 'ACTIVO'
    : foco.kind === 'grupo'
    ? 'TRIANGULADO'
    : raw.estado_aviso || 'PENDIENTE';

  const fuentePrincipal = isIncidente
    ? informes.length > 0
      ? 'Brigada en tierra · Central CAD'
      : raw.id_aviso
      ? 'Reporte ciudadano SOS + Central CAD'
      : 'Central CAD · Satélite VIIRS/MODIS'
    : foco.kind === 'grupo'
    ? `Triangulación multi-reporte (${raw.cantidad_avisos || 0} avisos)`
    : 'Reporte ciudadano SOS';

  const sevMeta = TELEMETRIA_SEVERIDAD[nivelAlerta] || TELEMETRIA_SEVERIDAD.MEDIA;
  const radioM = RADIO_IMPACTO_M[nivelAlerta] || 700;
  const duracionMin =
    raw.duracion_min ?? raw.tiempo_transcurrido_min ?? 12;

  const hectareasReales = raw.hectareas_afectadas;
  const factorTiempo = Math.min(1.8, 0.75 + Math.min(duracionMin, 180) / 180);
  const hectareasCalculadas = Number(
    ((sevMeta.haBase * factorTiempo * (estado === 'CERRADO' ? 1 : 0.9 + (seed % 3) * 0.12))).toFixed(1)
  );

  const baseContencion = CONTENCION_BASE[estado] ?? 20;
  const bonusInformes = isIncidente ? Math.min(15, informes.length * 6) : 0;
  const contencionPct =
    raw.porcentaje_contencion ??
    (estado === 'CERRADO' || estado === 'EXTINGUIDO'
      ? baseContencion
      : Math.min(92, baseContencion + bonusInformes));

  const frpMw =
    raw.frp_mw ??
    (estado === 'CERRADO' || estado === 'EXTINGUIDO'
      ? 0
      : Math.round(sevMeta.frp * (0.9 + (seed % 4) * 0.08)));

  const temperaturaFocoC =
    raw.temperatura_c ??
    (estado === 'CERRADO'
      ? 42
      : estado === 'EXTINGUIDO'
      ? 78
      : Math.round(sevMeta.tempC * (0.95 + (seed % 3) * 0.05)));

  const fotoUrl =
    typeof raw.foto === 'string' &&
    /^(https?:\/\/|data:image\/)/i.test(raw.foto.trim())
      ? raw.foto.trim()
      : null;

  const avisoVinculado =
    isIncidente && raw.id_aviso
      ? avisos.find((a) => a.id_aviso === raw.id_aviso)
      : null;

  const historial = [];
  if (avisoVinculado) {
    historial.push({
      hora: formatFechaHora(avisoVinculado.fecha_hora || avisoVinculado.created_at),
      titulo: `Reporte inicial Aviso #${avisoVinculado.id_aviso}`,
      detalle: avisoVinculado.descripcion || avisoVinculado.ubicacion,
      fuente: 'Reporte ciudadano SOS',
    });
  }

  const tsInicio = raw.fecha_inicio || raw.fecha_hora || raw.created_at;
  if (tsInicio) {
    historial.push({
      hora: formatFechaHora(tsInicio),
      titulo: isIncidente
        ? `Apertura Incidente #${raw.id_incidente} (${nivelAlerta})`
        : foco.kind === 'grupo'
        ? `Triangulación de ${raw.cantidad_avisos} focos cercanos`
        : `Ingreso de Aviso #${raw.id_aviso} (${nivelAlerta})`,
      detalle: raw.descripcion || raw.ubicacion,
      fuente: isIncidente ? 'Central CAD / Satélite VIIRS' : 'Reporte ciudadano SOS',
    });
  }

  if (raw.alerta_sla) {
    historial.push({
      hora: `+${raw.tiempo_transcurrido_min} min`,
      titulo: 'Alerta de SLA superado (>15 min pendiente)',
      detalle: 'Requiere verificación o despacho prioritario.',
      fuente: 'Monitor automático CAD',
    });
  }

  if (isIncidente && Array.isArray(informes) && informes.length > 0) {
    informes.forEach((inf) => {
      historial.push({
        hora: formatFechaHora(inf.fecha_hora || inf.created_at),
        titulo: `Informe de campo #${inf.id_informe}`,
        detalle: inf.acciones,
        fuente: 'Brigada en tierra',
      });
    });
  }

  if (raw.updated_at && raw.updated_at !== tsInicio) {
    historial.push({
      hora: formatFechaHora(raw.updated_at),
      titulo: `Estado actualizado a ${estado}`,
      detalle: `Contención estimada al ${contencionPct}% · Radio impacto ${
        radioM >= 1000 ? `${(radioM / 1000).toFixed(1)} km` : `${radioM} m`
      }`,
      fuente: informes.length > 0 ? 'Brigada en tierra' : 'Central CAD',
    });
  }

  if (raw.fecha_cierre) {
    historial.push({
      hora: formatFechaHora(raw.fecha_cierre),
      titulo: 'Cierre operativo del incidente',
      detalle: `Duración total registrada: ${raw.duracion_min ?? 0} min.`,
      fuente: 'Central CAD',
    });
  }

  if (historial.length === 0) {
    historial.push({
      hora: 'Reciente',
      titulo: `Detección activa en ${zonaNombre}`,
      detalle: raw.ubicacion || 'Coordenada georreferenciada',
      fuente: fuentePrincipal,
    });
  }

  return {
    cabecera: {
      titulo: isIncidente
        ? `Incidente #${raw.id_incidente}`
        : foco.kind === 'grupo'
        ? `Zona Triangulada #${raw.id_grupo}`
        : `Aviso #${raw.id_aviso}`,
      subtitulo: zonaNombre,
      estado,
      nivelAlerta,
      ubicacion: raw.ubicacion || zonaNombre,
      lat: coords?.lat,
      lng: coords?.lng,
      alertaSla: Boolean(raw.alerta_sla),
      fuenteDato: fuentePrincipal,
      fotoUrl,
      descripcion: raw.descripcion || null,
    },
    metricas: {
      hectareas: hectareasReales ?? hectareasCalculadas,
      hectareasEsEstimado: hectareasReales == null,
      contencionPct,
      frpMw,
      temperaturaFocoC,
    },
    historial,
  };
}
