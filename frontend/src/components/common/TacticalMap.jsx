import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TacticalDrawer } from './TacticalDrawer';
import {
  RADIO_IMPACTO_M,
  RANGOS_FRP_SATELITE,
  agruparFocosPorZoom,
  agruparSatelitePorGrilla,
  clasificarRangoFrp,
  construirFocoDetalle,
  escapeHtml,
  generarPerimetroPoligono,
  tooltipHtmlFoco,
} from '../../utils/tacticalMapHelpers';

const DEFAULT_CENTER = [-17.36, -66.16];
const DEFAULT_ZOOM = 10;

const BOLIVIA_SECTOR = {
  id: 'bolivia',
  label: '🇧🇴 Toda Bolivia',
  coords: [-16.45, -64.35],
  zoom: 6,
};

const SECTORES_CIUDADANO = [
  { id: 'general', label: 'Vista General', coords: [-17.36, -66.16], zoom: 10 },
  { id: 'tunari', label: 'Parque Tunari', coords: [-17.3125, -66.1842], zoom: 13 },
  { id: 'serrania', label: 'Reserva Serranía', coords: [-17.2054, -66.3011], zoom: 13 },
  { id: 'valle', label: 'Valle Alto', coords: [-17.5241, -65.9812], zoom: 12 },
  { id: 'sanpedro', label: 'Cerro San Pedro', coords: [-17.3833, -66.145], zoom: 14 },
];

const SECTORES_OPERADOR = [
  BOLIVIA_SECTOR,
  { id: 'cochabamba', label: 'Cochabamba', coords: [-17.36, -66.16], zoom: 10 },
  { id: 'tunari', label: 'Parque Tunari', coords: [-17.3125, -66.1842], zoom: 13 },
  { id: 'chiquitania', label: 'Chiquitanía / Sta. Cruz', coords: [-17.45, -60.85], zoom: 7 },
  { id: 'beni', label: 'Beni / Llanos', coords: [-14.20, -64.90], zoom: 7 },
  { id: 'amazonia', label: 'Norte / Amazonía', coords: [-11.20, -67.20], zoom: 7 },
  { id: 'chaco', label: 'Chaco / Sur', coords: [-20.80, -63.40], zoom: 7 },
];

const CAPAS_BASE = [
  { id: 'dark', label: 'Táctico Oscuro' },
  { id: 'sat', label: 'Satélite' },
  { id: 'topo', label: 'Topográfico' },
  { id: 'osm', label: 'Mapa Urbano' },
];

const ZONE_COLORS = {
  EXTREMO: '#ef4444',
  ALTO: '#f97316',
  MEDIO: '#eab308',
  BAJO: '#22c55e',
};

const SVG_FLAME = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`;
const SVG_SHIELD = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1.5 14.5l-3.5-3.5 1.41-1.41L10.5 12.67l5.09-5.09L17 9l-6.5 6.5z"/></svg>`;
const SVG_BEACON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
const SVG_CROSSHAIR = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="7"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;
const SVG_SATELLITE = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M19.8 18.4L14 12.6l2.4-2.4 1.4 1.4 3.5-3.5-5.6-5.6-3.5 3.5 1.4 1.4L11.2 9.8 5.4 4 2.6 6.8l5.8 5.8-2.4 2.4-1.4-1.4L1.1 17.1l5.6 5.6 3.5-3.5-1.4-1.4 2.4-2.4 5.8 5.8 2.8-2.8zM4.9 19.3l-1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1zM15.7 5.7l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4z"/></svg>`;

function resolverCoordsIncidente(inc, zonasById) {
  if (inc.coordenadas) return inc.coordenadas;
  if (inc.id_zona && zonasById.has(inc.id_zona)) {
    const zc = zonasById.get(inc.id_zona);
    return { lat: zc.lat + 0.006, lng: zc.lng + 0.006 };
  }
  return null;
}

export function TacticalMap({
  zonas = [],
  avisos = [],
  gruposTriangulados = [],
  incidentes = [],
  informes = [],
  firmsData = null,
  capaSatelitalActiva = false,
  firmsSimulado = false,
  firmsDays = 3,
  selectedIncidenteId,
  pickedPoint,
  onSelectIncidente,
  onPickPoint,
  onToggleCapaSatelital,
  onToggleSimulacionFirms,
  onRefrescarFirms,
  onCambiarDiasFirms,
  onCrearAvisoDesdeSatelite,
  onSimularDiezAlarmas,
  onConsolidarGrupo,
  onVerificarAviso,
  onConvertirAviso,
  onGestionarIncidente,
  loading = false,
  modoCiudadano = false,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const baseLayersRef = useRef(null);
  const onPickRef = useRef(onPickPoint);
  const onSelectRef = useRef(onSelectIncidente);

  const [capaBase, setCapaBase] = useState('dark');
  const [sectorActivo, setSectorActivo] = useState(
    modoCiudadano ? 'general' : 'cochabamba'
  );
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [viewportTick, setViewportTick] = useState(0);
  const [cursorCoords, setCursorCoords] = useState(null);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [focoSeleccionado, setFocoSeleccionado] = useState(null);
  const [rangosFrpActivos, setRangosFrpActivos] = useState(['fuerte', 'extremo']);
  const [panelFrpColapsado, setPanelFrpColapsado] = useState(false);
  const prevCapaSatRef = useRef(capaSatelitalActiva);

  useEffect(() => {
    onPickRef.current = onPickPoint;
  }, [onPickPoint]);

  useEffect(() => {
    onSelectRef.current = onSelectIncidente;
  }, [onSelectIncidente]);

  useEffect(() => {
    function alPresionar(ev) {
      if (ev.key === 'Escape') {
        setFocoSeleccionado(null);
      }
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    const cartoKey = import.meta.env.VITE_CARTO_API_KEY;
    const cartoSuffix = cartoKey ? `?key=${encodeURIComponent(cartoKey)}` : '';

    const topoLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri World Topo Map', maxZoom: 19 }
    );

    const osmLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }
    );

    const esriDarkBase = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri Dark Gray Canvas', maxNativeZoom: 16, maxZoom: 19 }
    );

    const esriDarkRef = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      { maxNativeZoom: 16, maxZoom: 19 }
    );

    const darkLayer = cartoKey
      ? L.tileLayer(
          `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${cartoSuffix}`,
          {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19,
          }
        )
      : L.layerGroup([esriDarkBase, esriDarkRef]);

    const satLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Esri World Imagery', maxZoom: 19 }
    );

    darkLayer.addTo(map);
    baseLayersRef.current = {
      dark: darkLayer,
      sat: satLayer,
      topo: topoLayer,
      osm: osmLayer,
    };

    layersRef.current = L.layerGroup().addTo(map);

    map.on('zoomend', () => {
      setMapZoom(map.getZoom());
    });

    map.on('moveend', () => {
      if (map.getZoom() >= 12) {
        setViewportTick((t) => t + 1);
      }
    });

    map.on('click', (e) => {
      onPickRef.current?.({
        lat: Number(e.latlng.lat.toFixed(4)),
        lng: Number(e.latlng.lng.toFixed(4)),
      });
    });

    map.on('mousemove', (e) => {
      setCursorCoords({
        lat: Number(e.latlng.lat.toFixed(4)),
        lng: Number(e.latlng.lng.toFixed(4)),
      });
    });

    map.on('mouseout', () => setCursorCoords(null));

    mapRef.current = map;
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      baseLayersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const bases = baseLayersRef.current;
    if (!map || !bases) return;

    Object.entries(bases).forEach(([key, layer]) => {
      if (key === capaBase) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }, [capaBase]);

  useEffect(() => {
    const activoAhora = !modoCiudadano && capaSatelitalActiva;
    if (activoAhora && !prevCapaSatRef.current) {
      setSectorActivo(BOLIVIA_SECTOR.id);
      mapRef.current?.flyTo(BOLIVIA_SECTOR.coords, BOLIVIA_SECTOR.zoom, {
        duration: 0.85,
      });
    }
    prevCapaSatRef.current = activoAhora;
  }, [capaSatelitalActiva, modoCiudadano]);

  const zonasVisibles = useMemo(
    () => zonas.filter((z) => z.coordenadas && z.estado !== 'Inactiva'),
    [zonas]
  );

  const avisosVisibles = useMemo(
    () =>
      avisos.filter(
        (a) =>
          a.coordenadas &&
          (a.estado_aviso === 'PENDIENTE' || a.estado_aviso === 'VERIFICADO')
      ),
    [avisos]
  );

  const { conteoPorRangoFrp, focosSateliteFiltrados, totalSat } = useMemo(() => {
    const lista = Array.isArray(firmsData?.focos) ? firmsData.focos : [];
    const conteos = { bajo: 0, moderado: 0, fuerte: 0, extremo: 0 };
    const activosSet = new Set(rangosFrpActivos);
    const filtrados = [];

    for (let i = 0; i < lista.length; i += 1) {
      const f = lista[i];
      const info = clasificarRangoFrp(f.frp_mw);
      conteos[info.id] = (conteos[info.id] || 0) + 1;
      if (activosSet.has(info.id)) {
        filtrados.push(f);
      }
    }
    return {
      conteoPorRangoFrp: conteos,
      focosSateliteFiltrados: filtrados,
      totalSat: lista.length,
    };
  }, [firmsData, rangosFrpActivos]);

  const focoActivoResuelto = useMemo(() => {
    if (!focoSeleccionado) return null;
    const { kind, id } = focoSeleccionado;

    if (kind === 'aviso') {
      const a = avisosVisibles.find((item) => item.id_aviso === id);
      if (!a) return null;
      return { kind: 'aviso', id: a.id_aviso, coords: a.coordenadas, raw: a };
    }

    if (kind === 'incidente') {
      const zonasMap = new Map(zonasVisibles.map((z) => [z.id_zona, z.coordenadas]));
      const inc = incidentes.find((item) => item.id_incidente === id);
      if (!inc) return null;
      const coords = resolverCoordsIncidente(inc, zonasMap);
      return coords ? { kind: 'incidente', id: inc.id_incidente, coords, raw: inc } : null;
    }

    if (kind === 'grupo') {
      const grp = gruposTriangulados.find((item) => item.id_grupo === id);
      if (!grp?.centroide) return null;
      return { kind: 'grupo', id: grp.id_grupo, coords: grp.centroide, raw: grp };
    }

    if (kind === 'satelite') {
      const sat = focosSateliteFiltrados.find((item) => item.id_foco === id);
      if (!sat?.coordenadas) return null;
      return { kind: 'satelite', id: sat.id_foco, coords: sat.coordenadas, raw: sat };
    }

    return null;
  }, [
    focoSeleccionado,
    avisosVisibles,
    incidentes,
    gruposTriangulados,
    zonasVisibles,
    focosSateliteFiltrados,
  ]);

  const detalleDrawer = useMemo(() => {
    if (!focoActivoResuelto) return null;
    const informesDelFoco =
      focoActivoResuelto.kind === 'incidente' &&
      focoActivoResuelto.id === selectedIncidenteId
        ? informes
        : [];
    return construirFocoDetalle({
      foco: focoActivoResuelto,
      zonas,
      informes: informesDelFoco,
      avisos,
    });
  }, [focoActivoResuelto, selectedIncidenteId, informes, zonas, avisos]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const zonasById = new Map();

    // 1. Zonas de riesgo base (polígono real si existe, o radio de cobertura)
    zonasVisibles.forEach((z) => {
      zonasById.set(z.id_zona, z.coordenadas);
      const color = ZONE_COLORS[z.nivel_riesgo] || '#f97316';
      const esAlertaCoe = z.estado === 'Alerta Emitida';
      const climaTxt =
        z.temperatura != null
          ? `🌡️ ${z.temperatura}°C · 💧 ${z.humedad}% · 💨 ${z.velocidad_viento} km/h`
          : 'Zona de riesgo monitoreada';
      const ubicacionTip = `${
        esAlertaCoe ? '🚨 ALERTA COE · ' : ''
      }${z.tipo_vegetacion ? `${z.tipo_vegetacion} · ` : ''}${climaTxt}`;
      const tooltipZone = tooltipHtmlFoco({
        titulo: z.nombre,
        ubicacion: ubicacionTip,
        estado: esAlertaCoe ? `${z.nivel_riesgo} · ALERTA COE` : z.nivel_riesgo,
        actualizadoIso: new Date().toISOString(),
      });

      if (Array.isArray(z.poligono) && z.poligono.length >= 3) {
        L.polygon(
          z.poligono.map((p) => [p.lat, p.lng]),
          {
            color,
            fillColor: color,
            fillOpacity: esAlertaCoe ? 0.24 : 0.14,
            weight: esAlertaCoe ? 2.6 : 1.8,
            dashArray: esAlertaCoe ? undefined : '5, 4',
          }
        )
          .bindTooltip(tooltipZone, {
            direction: 'top',
            opacity: 0.96,
            className: 'tactical-tooltip',
          })
          .addTo(group);
      } else {
        L.circle([z.coordenadas.lat, z.coordenadas.lng], {
          radius: 4400,
          color,
          fillColor: color,
          fillOpacity: 0.06,
          weight: 1.4,
          dashArray: '6, 6',
          interactive: false,
        }).addTo(group);

        L.circle([z.coordenadas.lat, z.coordenadas.lng], {
          radius: 2100,
          color,
          fillColor: color,
          fillOpacity: esAlertaCoe ? 0.24 : 0.16,
          weight: esAlertaCoe ? 2.4 : 1.8,
        })
          .bindTooltip(tooltipZone, {
            direction: 'top',
            opacity: 0.96,
            className: 'tactical-tooltip',
          })
          .addTo(group);
      }

      const labelIcon = L.divIcon({
        className: 'leaflet-div-marker-wrapper',
        html: `<div class="zone-label-chip" style="border-color:${color}">${escapeHtml(
          z.nombre
        )} · <b>${escapeHtml(z.nivel_riesgo)}</b>${
          esAlertaCoe ? ' 🚨' : ''
        }</div>`,
        iconSize: [200, 20],
        iconAnchor: [100, -18],
      });
      L.marker([z.coordenadas.lat, z.coordenadas.lng], {
        icon: labelIcon,
        interactive: false,
      }).addTo(group);
    });

    // 2. Unificar focos activos para agrupación inteligente según zoom
    const focos = [
      ...avisosVisibles.map((a) => ({
        kind: 'aviso',
        id: a.id_aviso,
        coords: a.coordenadas,
        esCritico: Boolean(a.alerta_sla || a.nivel_urgencia === 'CRITICO'),
        raw: a,
      })),
      ...incidentes
        .map((inc) => {
          const coords = resolverCoordsIncidente(inc, zonasById);
          if (!coords) return null;
          return {
            kind: 'incidente',
            id: inc.id_incidente,
            coords,
            esCritico:
              inc.estado === 'ACTIVO' ||
              inc.gravedad === 'CATASTROFICA' ||
              inc.gravedad === 'ALTA',
            raw: inc,
          };
        })
        .filter(Boolean),
    ];

    const nodosMapa = modoCiudadano
      ? focos.map((f) => ({
          id: `${f.kind}-${f.id}`,
          esCluster: false,
          coords: f.coords,
          items: [f],
          foco: f,
        }))
      : agruparFocosPorZoom(focos, mapZoom);

    const mostrarPerimetros = mapZoom >= 12;

    // 3. Polígonos del perímetro afectado (cuando el zoom muestra detalle)
    if (!modoCiudadano && mostrarPerimetros && Array.isArray(gruposTriangulados)) {
      gruposTriangulados.forEach((grp) => {
        if (!grp.centroide) return;
        const pts = Array.isArray(grp.puntos) ? grp.puntos : [];
        if (pts.length >= 3) {
          L.polygon(
            pts.map((p) => [p.lat, p.lng]),
            {
              color: '#a855f7',
              weight: 2,
              dashArray: '5 4',
              fillColor: '#9333ea',
              fillOpacity: 0.18,
              interactive: false,
            }
          ).addTo(group);
        }
        pts.forEach((p) => {
          L.polyline(
            [
              [p.lat, p.lng],
              [grp.centroide.lat, grp.centroide.lng],
            ],
            {
              color: '#a855f7',
              weight: 1.4,
              dashArray: '3 5',
              opacity: 0.75,
              interactive: false,
            }
          ).addTo(group);
        });

        const clusterIcon = L.divIcon({
          className: 'leaflet-div-marker-wrapper',
          html: `<div class="tac-marker tac-cluster">
            <span class="tac-pulse-ring pulse-ring-cluster"></span>
            <span class="tac-core">${SVG_CROSSHAIR}<span>🎯 ${grp.cantidad_avisos} alarmas</span></span>
          </div>`,
          iconSize: [110, 30],
          iconAnchor: [55, 15],
        });

        L.marker([grp.centroide.lat, grp.centroide.lng], {
          icon: clusterIcon,
          zIndexOffset: 650,
        })
          .bindTooltip(
            tooltipHtmlFoco({
              titulo: `Zona Triangulada #${grp.id_grupo}`,
              ubicacion: `${grp.cantidad_avisos} alarmas · ${grp.zona_sugerida?.nombre || 'Sector GPS'}`,
              estado: grp.nivel_urgencia_max,
              actualizadoIso: new Date().toISOString(),
            }),
            { direction: 'top', offset: [0, -14], opacity: 0.96, className: 'tactical-tooltip' }
          )
          .on('click', () => {
            onPickRef.current?.(grp.centroide);
            setFocoSeleccionado({ kind: 'grupo', id: grp.id_grupo });
          })
          .addTo(group);
      });
    }

    // 4. Renderizar clusters o focos individuales + polígonos de perímetro
    nodosMapa.forEach((nodo) => {
      if (nodo.esCluster) {
        const { coords, items, tieneCritico, incCount, avCount, bounds } = nodo;
        const tamano = Math.min(54, 36 + items.length * 2);
        const icon = L.divIcon({
          className: 'leaflet-div-marker-wrapper',
          html: `<div class="tac-cluster-circle ${tieneCritico ? 'is-critical' : ''}" style="width:${tamano}px;height:${tamano}px">
            <span class="tac-cluster-ring"></span>
            <span class="tac-cluster-num">${items.length}</span>
          </div>`,
          iconSize: [tamano, tamano],
          iconAnchor: [tamano / 2, tamano / 2],
        });

        const resumenPartes = [
          incCount > 0 ? `${incCount} inc.` : '',
          avCount > 0 ? `${avCount} avisos` : '',
        ]
          .filter(Boolean)
          .join(' · ');

        L.marker([coords.lat, coords.lng], {
          icon,
          zIndexOffset: tieneCritico ? 900 : 780,
        })
          .bindTooltip(
            `<div class="tac-tt-inner">
              <div class="tac-tt-title">${items.length} focos cercanos agrupados</div>
              <div class="tac-tt-loc">${escapeHtml(resumenPartes)} · Clic para acercar</div>
            </div>`,
            { direction: 'top', offset: [0, -tamano / 2], opacity: 0.96, className: 'tactical-tooltip' }
          )
          .on('click', () => {
            if (bounds.length >= 2) {
              map.fitBounds(bounds, { padding: [55, 55], maxZoom: 14 });
            } else {
              map.flyTo([coords.lat, coords.lng], Math.max(mapZoom + 2, 13), { duration: 0.6 });
            }
          })
          .addTo(group);
        return;
      }

      const foco = nodo.foco;
      if (foco.kind === 'aviso') {
        const a = foco.raw;
        const slaClass = a.alerta_sla ? 'is-sla' : '';
        const urgSlug = String(a.nivel_urgencia || 'ALTO').toLowerCase();
        const isOpen =
          focoSeleccionado?.kind === 'aviso' && focoSeleccionado?.id === a.id_aviso;

        if (mostrarPerimetros && Array.isArray(a.perimetro) && a.perimetro.length >= 3) {
          L.polygon(
            generarPerimetroPoligono(a.coordenadas, 350, a.id_aviso, a.perimetro),
            {
              color: '#f59e0b',
              weight: 1.8,
              fillColor: '#fbbf24',
              fillOpacity: 0.16,
              interactive: false,
            }
          ).addTo(group);
        }

        const icon = L.divIcon({
          className: 'leaflet-div-marker-wrapper',
          html: `<div class="tac-marker tac-aviso urgencia-${urgSlug} ${slaClass} ${
            isOpen ? 'is-selected' : ''
          }">
            <span class="tac-pulse-ring pulse-ring-aviso"></span>
            <span class="tac-core">${SVG_BEACON}<span>A${a.id_aviso}</span></span>
          </div>`,
          iconSize: [56, 30],
          iconAnchor: [28, 15],
        });

        L.marker([a.coordenadas.lat, a.coordenadas.lng], {
          icon,
          zIndexOffset: a.alerta_sla ? 950 : 760,
        })
          .bindTooltip(
            tooltipHtmlFoco({
              titulo: `Aviso #${a.id_aviso}`,
              ubicacion: a.ubicacion,
              estado: `${a.estado_aviso} · ${a.nivel_urgencia}`,
              actualizadoIso: a.created_at || a.fecha_hora,
            }),
            { direction: 'top', offset: [0, -14], opacity: 0.96, className: 'tactical-tooltip' }
          )
          .on('click', () => {
            onPickRef.current?.(a.coordenadas);
            setFocoSeleccionado({ kind: 'aviso', id: a.id_aviso });
          })
          .addTo(group);
        return;
      }

      // Foco individual: Incidente
      const inc = foco.raw;
      const coords = foco.coords;
      const radioImpacto = RADIO_IMPACTO_M[inc.gravedad] || 700;

      if (mostrarPerimetros && inc.estado !== 'CERRADO') {
        const esActivoCirc = inc.estado === 'ACTIVO';
        const polyPts = generarPerimetroPoligono(
          coords,
          radioImpacto,
          inc.id_incidente,
          inc.perimetro
        );
        if (polyPts.length >= 3) {
          L.polygon(polyPts, {
            color: esActivoCirc ? '#ef4444' : '#38bdf8',
            weight: esActivoCirc ? 2 : 1.5,
            dashArray: esActivoCirc ? '6 4' : '3 5',
            fillColor: esActivoCirc ? '#ef4444' : '#38bdf8',
            fillOpacity: esActivoCirc ? 0.18 : 0.1,
            interactive: false,
          }).addTo(group);
        }
      }

      const isSelected =
        selectedIncidenteId === inc.id_incidente ||
        (focoSeleccionado?.kind === 'incidente' &&
          focoSeleccionado?.id === inc.id_incidente);
      const estadoSlug = String(inc.estado || 'activo').toLowerCase();
      const esActivo = estadoSlug === 'activo';
      const svgIcon = esActivo ? SVG_FLAME : SVG_SHIELD;

      const icon = L.divIcon({
        className: 'leaflet-div-marker-wrapper',
        html: `<div class="tac-marker tac-incidente estado-${estadoSlug} ${
          isSelected ? 'is-selected' : ''
        }">
          ${esActivo ? '<span class="tac-pulse-ring pulse-ring-danger"></span>' : ''}
          <span class="tac-core">${svgIcon}<span>#${inc.id_incidente}</span></span>
        </div>`,
        iconSize: [58, 30],
        iconAnchor: [29, 15],
      });

      L.marker([coords.lat, coords.lng], {
        icon,
        zIndexOffset: esActivo ? 820 : 620,
      })
        .bindTooltip(
          tooltipHtmlFoco({
            titulo: `Incidente #${inc.id_incidente}`,
            ubicacion: inc.ubicacion,
            estado: `${inc.estado} · ${inc.gravedad}`,
            actualizadoIso: inc.updated_at || inc.fecha_inicio || inc.created_at,
          }),
          { direction: 'top', offset: [0, -14], opacity: 0.96, className: 'tactical-tooltip' }
        )
        .on('click', () => {
          onSelectRef.current?.(inc.id_incidente);
          setFocoSeleccionado({ kind: 'incidente', id: inc.id_incidente });
        })
        .addTo(group);
    });

    if (pickedPoint) {
      const pinIcon = L.divIcon({
        className: 'leaflet-div-marker-wrapper',
        html: `<div class="tac-marker tac-pin">
          <span class="tac-pulse-ring pulse-ring-pin"></span>
          <span class="tac-core">${SVG_CROSSHAIR}<span>GPS</span></span>
        </div>`,
        iconSize: [58, 28],
        iconAnchor: [29, 14],
      });
      L.marker([pickedPoint.lat, pickedPoint.lng], { icon: pinIcon, zIndexOffset: 500 })
        .bindTooltip(
          `<div class="tac-tt-inner">
            <div class="tac-tt-title">Coordenada GPS / Pin</div>
            <div class="tac-tt-loc">${pickedPoint.lat}, ${pickedPoint.lng}</div>
          </div>`,
          { direction: 'top', offset: [0, -14], opacity: 0.96, className: 'tactical-tooltip' }
        )
        .addTo(group);
    }

    // 5. Capa satelital NASA FIRMS nacional (Bolivia) con grilla por zoom y filtro FRP (MW)
    if (!modoCiudadano && capaSatelitalActiva && focosSateliteFiltrados.length > 0) {
      const b = map.getBounds();
      const viewportBounds = b
        ? {
            south: b.getSouth(),
            north: b.getNorth(),
            west: b.getWest(),
            east: b.getEast(),
          }
        : null;
      const nodosSatelite = agruparSatelitePorGrilla(
        focosSateliteFiltrados,
        mapZoom,
        viewportBounds
      );

      nodosSatelite.forEach((nodoSat) => {
        if (nodoSat.esCluster) {
          const {
            coords,
            count,
            maxFrp,
            altaCount,
            departamento,
            bounds,
          } = nodoSat;
          const tamano = Math.min(58, Math.round(36 + Math.log10(count + 1) * 10));
          const esAlto = altaCount > 0;
          const satClusterIcon = L.divIcon({
            className: 'leaflet-div-marker-wrapper',
            html: `<div class="tac-sat-cluster ${esAlto ? 'has-high' : ''}" style="width:${tamano}px;height:${tamano}px">
              <span class="tac-sat-cluster-num">${count}</span>
            </div>`,
            iconSize: [tamano, tamano],
            iconAnchor: [tamano / 2, tamano / 2],
          });

          L.marker([coords.lat, coords.lng], {
            icon: satClusterIcon,
            zIndexOffset: esAlto ? 840 : 720,
          })
            .bindTooltip(
              `<div class="tac-tt-inner">
                <div class="tac-tt-title">🛰️ ${count} focos térmicos NASA FIRMS</div>
                <div class="tac-tt-loc">Dpto. ${escapeHtml(
                  departamento || 'Bolivia'
                )} · Máx. ${maxFrp} MW (${altaCount} conf. alta)</div>
                <div class="tac-tt-meta">
                  <span class="tac-tt-badge">Clic para acercar región</span>
                </div>
              </div>`,
              {
                direction: 'top',
                offset: [0, -tamano / 2],
                opacity: 0.96,
                className: 'tactical-tooltip',
              }
            )
            .on('click', () => {
              if (bounds?.length === 2) {
                map.fitBounds(bounds, {
                  padding: [50, 50],
                  maxZoom: Math.min(mapZoom + 3, 13),
                });
              } else {
                map.flyTo([coords.lat, coords.lng], Math.min(mapZoom + 3, 13), {
                  duration: 0.65,
                });
              }
            })
            .addTo(group);
          return;
        }

        const f = nodoSat.foco;
        if (!f?.coordenadas) return;
        const infoFrp = clasificarRangoFrp(f.frp_mw);
        const sinReporte = f.correlacion === 'FOCO_NO_REPORTADO';
        const isSatOpen =
          focoSeleccionado?.kind === 'satelite' && focoSeleccionado?.id === f.id_foco;

        if (mapZoom >= 12) {
          L.circle([f.coordenadas.lat, f.coordenadas.lng], {
            radius: 380,
            color: sinReporte ? '#ef4444' : infoFrp.color,
            weight: 1.5,
            dashArray: '4 4',
            fillColor: sinReporte ? '#ef4444' : infoFrp.color,
            fillOpacity: 0.16,
            interactive: false,
          }).addTo(group);
        }

        const satIcon = L.divIcon({
          className: 'leaflet-div-marker-wrapper',
          html: `<div class="tac-marker tac-satelite frp-${infoFrp.id} ${
            sinReporte ? 'is-unreported' : ''
          } ${isSatOpen ? 'is-selected' : ''}">
            ${sinReporte ? '<span class="tac-pulse-ring pulse-ring-satelite"></span>' : ''}
            <span class="tac-core">${SVG_SATELLITE}<span>${Math.round(
              f.frp_mw || 0
            )}MW</span></span>
          </div>`,
          iconSize: [64, 28],
          iconAnchor: [32, 14],
        });

        const estadoCorr = sinReporte
          ? 'SIN REPORTE CIUDADANO'
          : f.correlacion === 'AVISO_EN_TRIAGE'
          ? `RESPALDA AVISO #${f.aviso_cercano?.id_aviso}`
          : `EN INCIDENTE #${f.incidente_cercano?.id_incidente}`;

        L.marker([f.coordenadas.lat, f.coordenadas.lng], {
          icon: satIcon,
          zIndexOffset: sinReporte ? 880 : 710,
        })
          .bindTooltip(
            `<div class="tac-tt-inner">
              <div class="tac-tt-title">🛰️ ${escapeHtml(f.instrumento || 'VIIRS')} · ${
              f.frp_mw
            } MW (${escapeHtml(infoFrp.peligroLabel)})</div>
              <div class="tac-tt-loc">${escapeHtml(
                f.zona_cercana
                  ? `${f.zona_cercana.nombre} (~${f.zona_cercana.distancia_km} km)`
                  : f.departamento
                  ? `Dpto. ${f.departamento} · ${f.lat}, ${f.lng}`
                  : `${f.lat}, ${f.lng}`
              )}</div>
              <div class="tac-tt-meta">
                <span class="tac-tt-badge">${escapeHtml(estadoCorr)}</span>
                <span class="tac-tt-time">${escapeHtml(f.fecha_hora_local || '')}</span>
              </div>
            </div>`,
            { direction: 'top', offset: [0, -14], opacity: 0.96, className: 'tactical-tooltip' }
          )
          .on('click', () => {
            onPickRef.current?.(f.coordenadas);
            setFocoSeleccionado({ kind: 'satelite', id: f.id_foco });
          })
          .addTo(group);
      });
    }
  }, [
    zonasVisibles,
    avisosVisibles,
    gruposTriangulados,
    incidentes,
    selectedIncidenteId,
    focoSeleccionado,
    pickedPoint,
    modoCiudadano,
    mapZoom,
    viewportTick,
    capaSatelitalActiva,
    focosSateliteFiltrados,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && pickedPoint) {
      map.panTo([pickedPoint.lat, pickedPoint.lng], { animate: true });
    }
  }, [pickedPoint]);

  const sectoresRapidos = modoCiudadano ? SECTORES_CIUDADANO : SECTORES_OPERADOR;
  const soloEmergenciasActivo =
    rangosFrpActivos.length === 2 &&
    rangosFrpActivos.includes('fuerte') &&
    rangosFrpActivos.includes('extremo');
  const todosRangosActivos = rangosFrpActivos.length === RANGOS_FRP_SATELITE.length;

  function toggleRangoFrp(idRango) {
    setRangosFrpActivos((prev) =>
      prev.includes(idRango)
        ? prev.filter((item) => item !== idRango)
        : [...prev, idRango]
    );
  }

  function flyToSector(sector) {
    setSectorActivo(sector.id);
    mapRef.current?.flyTo(sector.coords, sector.zoom, { duration: 0.8 });
  }

  return (
    <section
      className={`card map-card ${capaBase === 'dark' ? 'map-dark-theme' : ''}`}
    >
      <div className="card-header">
        <div>
          <h2>
            {modoCiudadano
              ? 'Ubicación en Mapa (Cochabamba)'
              : 'Mapa Táctico Operativo (GIS — Monitoreo Nacional Bolivia)'}
          </h2>
          <p className="subtitle">
            {modoCiudadano
              ? 'Toca el mapa o usa tu GPS para marcar la ubicación del incendio'
              : 'Pasa el cursor para vista rápida o haz clic en un foco para abrir el panel de telemetría'}
          </p>
        </div>
        <div className="map-controls-bar">
          <div className="segmented-pills" role="group" aria-label="Estilo de mapa">
            {CAPAS_BASE.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`seg-btn ${capaBase === c.id ? 'active' : ''}`}
                onClick={() => setCapaBase(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {!modoCiudadano && onToggleCapaSatelital && (
            <button
              type="button"
              className={`btn-firms-toggle ${capaSatelitalActiva ? 'active' : ''}`}
              onClick={onToggleCapaSatelital}
              title="Mostrar u ocultar anomalías térmicas satelitales NASA FIRMS"
            >
              🛰️ NASA FIRMS
              {capaSatelitalActiva
                ? focosSateliteFiltrados.length !== totalSat
                  ? ` (${focosSateliteFiltrados.length}/${totalSat})`
                  : ` (${totalSat})`
                : ''}
            </button>
          )}
          {pickedPoint && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onPickPoint?.(null)}
            >
              Limpiar pin ({pickedPoint.lat}, {pickedPoint.lng})
            </button>
          )}
        </div>
      </div>

      {!modoCiudadano && capaSatelitalActiva && (
        <div className="firms-status-strip" role="status">
          <div className="firms-status-left">
            <span
              className={`firms-source-pill ${
                firmsData?.estado_fuente === 'en_vivo' ||
                firmsData?.estado_fuente === 'cache'
                  ? 'is-live'
                  : firmsData?.estado_fuente === 'simulacion'
                  ? 'is-demo'
                  : 'is-warn'
              }`}
            >
              {firmsData?.estado_fuente === 'en_vivo'
                ? 'EN VIVO'
                : firmsData?.estado_fuente === 'cache'
                ? 'CACHÉ'
                : firmsData?.estado_fuente === 'simulacion'
                ? 'DEMO'
                : firmsData?.estado_fuente === 'sin_clave'
                ? 'SIN CLAVE'
                : 'SIN CONEXIÓN'}
            </span>
            <span>{firmsData?.mensaje || 'Consultando satélite NASA FIRMS...'}</span>
            {(firmsData?.resumen?.sin_reporte ?? 0) > 0 && (
              <span className="firms-unreported-count">
                · {firmsData.resumen.sin_reporte} sin reporte ciudadano
              </span>
            )}
          </div>
          <div className="item-actions">
            {!firmsSimulado && onCambiarDiasFirms && (
              <div
                className="firms-days-group"
                role="group"
                aria-label="Ventana temporal satelital"
              >
                {[
                  { d: 1, label: '24h' },
                  { d: 3, label: '72h' },
                  { d: 5, label: '5d' },
                ].map((item) => (
                  <button
                    key={item.d}
                    type="button"
                    className={`firms-day-btn ${firmsDays === item.d ? 'active' : ''}`}
                    onClick={() => onCambiarDiasFirms(item.d)}
                    disabled={loading}
                    title={`Consultar focos NASA FIRMS (${item.label})`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {onToggleSimulacionFirms && (
              <button
                type="button"
                className="btn-secondary btn-xs"
                onClick={onToggleSimulacionFirms}
                disabled={loading}
              >
                🧪 {firmsSimulado ? 'Salir de Demo' : 'Probar Pasada Demo'}
              </button>
            )}
            {firmsData?.configurado && !firmsSimulado && onRefrescarFirms && (
              <button
                type="button"
                className="btn-secondary btn-xs"
                onClick={onRefrescarFirms}
                disabled={loading}
              >
                ↻ Actualizar NASA
              </button>
            )}
            <button
              type="button"
              className="btn-secondary btn-xs"
              onClick={() => flyToSector(BOLIVIA_SECTOR)}
              title="Encuadrar todo el territorio de Bolivia"
            >
              🇧🇴 Toda Bolivia
            </button>
          </div>
        </div>
      )}

      {!modoCiudadano && gruposTriangulados.length > 0 && (
        <div className="list-stack" style={{ marginBottom: '0.65rem' }}>
          {gruposTriangulados.map((grp) => (
            <div key={grp.id_grupo} className="item-row compact cluster-row">
              <div className="item-main">
                <div className="item-title">
                  <strong>
                    🎯 Zona Triangulada #{grp.id_grupo}: {grp.cantidad_avisos} alarmas cercanas agrupadas
                  </strong>{' '}
                  — {grp.zona_sugerida?.nombre || 'Sector detectado'} (Centroide:{' '}
                  {grp.centroide.lat}, {grp.centroide.lng} · ±{grp.radio_dispersion_km} km)
                </div>
              </div>
              <div className="item-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    mapRef.current?.flyTo(
                      [grp.centroide.lat, grp.centroide.lng],
                      14,
                      { duration: 0.7 }
                    );
                    setFocoSeleccionado({ kind: 'grupo', id: grp.id_grupo });
                  }}
                >
                  📍 Enfocar Zona
                </button>
                {onConsolidarGrupo && (
                  <button
                    type="button"
                    onClick={() => onConsolidarGrupo(grp)}
                    disabled={loading}
                  >
                    ⚡ Consolidar {grp.cantidad_avisos} en 1 Incidente
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="map-fly-bar" role="group" aria-label="Navegación rápida por sectores">
        {sectoresRapidos.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`fly-chip ${sectorActivo === s.id ? 'active' : ''}`}
            onClick={() => flyToSector(s)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="tactical-map-wrapper">
        <div
          ref={containerRef}
          className="tactical-map"
          role="region"
          aria-label="Mapa táctico interactivo de incendios"
        />

        {!modoCiudadano && capaSatelitalActiva && (
          <aside
            className={`firms-left-panel ${panelFrpColapsado ? 'is-collapsed' : ''}`}
            aria-label="Filtro de potencia satelital NASA FIRMS"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {panelFrpColapsado ? (
              <button
                type="button"
                className="firms-left-expand-btn"
                onClick={() => setPanelFrpColapsado(false)}
                title="Expandir filtros por potencia térmica (MW)"
              >
                🔥 Filtro MW ({focosSateliteFiltrados.length}/{totalSat}) ▶
              </button>
            ) : (
              <>
                <div className="firms-left-header">
                  <div>
                    <h3>🔥 Potencia Satelital (MW)</h3>
                    <p>Filtra focos menores para priorizar emergencias reales</p>
                  </div>
                  <button
                    type="button"
                    className="firms-left-collapse-btn"
                    onClick={() => setPanelFrpColapsado(true)}
                    aria-label="Minimizar subpanel de potencia"
                    title="Minimizar panel"
                  >
                    ◀
                  </button>
                </div>

                <div className="firms-left-presets">
                  <button
                    type="button"
                    className={`firms-preset-btn ${soloEmergenciasActivo ? 'is-active' : ''}`}
                    onClick={() => setRangosFrpActivos(['fuerte', 'extremo'])}
                  >
                    🚨 Emergencias (≥15 MW)
                  </button>
                  <button
                    type="button"
                    className={`firms-preset-btn ${todosRangosActivos ? 'is-active' : ''}`}
                    onClick={() =>
                      setRangosFrpActivos(RANGOS_FRP_SATELITE.map((r) => r.id))
                    }
                  >
                    Todos ({totalSat})
                  </button>
                </div>

                <div className="firms-frp-list">
                  {RANGOS_FRP_SATELITE.map((r) => {
                    const activo = rangosFrpActivos.includes(r.id);
                    const conteo = conteoPorRangoFrp[r.id] ?? 0;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`firms-frp-option ${activo ? 'is-active' : ''}`}
                        onClick={() => toggleRangoFrp(r.id)}
                        aria-pressed={activo}
                      >
                        <span className="firms-frp-check" aria-hidden="true">
                          {activo ? '✓' : ''}
                        </span>
                        <span
                          className="firms-frp-dot"
                          style={{ background: r.color }}
                          aria-hidden="true"
                        />
                        <span className="firms-frp-text">
                          <span className="firms-frp-title">
                            <strong>{r.rangoLabel}</strong> · {r.peligroLabel}
                          </span>
                          <span className="firms-frp-sub">{r.detalle}</span>
                        </span>
                        <span className="firms-frp-count">{conteo}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="firms-left-footer">
                  {rangosFrpActivos.length === 0 ? (
                    <span className="firms-left-warn">
                      Selecciona al menos un rango MW
                    </span>
                  ) : (
                    <span>
                      Mostrando <b>{focosSateliteFiltrados.length}</b> de{' '}
                      <b>{totalSat}</b> focos en Bolivia
                    </span>
                  )}
                </div>
              </>
            )}
          </aside>
        )}

        <TacticalDrawer
          foco={focoActivoResuelto}
          detalle={detalleDrawer}
          modoCiudadano={modoCiudadano}
          loading={loading}
          onClose={() => setFocoSeleccionado(null)}
          onAmpliarFoto={setFotoAmpliada}
          onEnfocarCoords={(coords) =>
            mapRef.current?.flyTo([coords.lat, coords.lng], Math.max(mapZoom, 14), {
              duration: 0.7,
            })
          }
          onVerificarAviso={onVerificarAviso}
          onConvertirAviso={onConvertirAviso}
          onGestionarIncidente={onGestionarIncidente}
          onConsolidarGrupo={onConsolidarGrupo}
          onCrearAvisoDesdeSatelite={onCrearAvisoDesdeSatelite}
        />

        <div className="map-hud-bottom">
          <div className="hud-stats">
            <span>Zonas: <b>{zonasVisibles.length}</b></span>
            {modoCiudadano ? (
              <span>Tus reportes: <b>{avisosVisibles.length}</b></span>
            ) : (
              <>
                <span>Avisos: <b>{avisosVisibles.length}</b></span>
                <span>Incidentes: <b>{incidentes.length}</b></span>
                <span>
                  Zoom <b>{mapZoom}</b> ·{' '}
                  {mapZoom >= 13 ? 'Detalle y perímetros' : 'Agrupación inteligente'}
                </span>
              </>
            )}
          </div>
          <div className="hud-coords">
            {cursorCoords
              ? `Cursor: ${cursorCoords.lat.toFixed(4)}, ${cursorCoords.lng.toFixed(4)}`
              : pickedPoint
              ? `Pin activo: ${pickedPoint.lat}, ${pickedPoint.lng}`
              : 'Mueve el cursor o haz clic en un foco'}
          </div>
        </div>
      </div>

      <div className="map-legend">
        {!modoCiudadano && (
          <>
            <span><i className="dot dot-inc" /> Incidente activo</span>
            <span><i className="dot dot-control" /> Controlado / Extinguido</span>
            <span><i className="dot dot-closed" /> Cerrado</span>
          </>
        )}
        <span><i className="dot dot-aviso" /> {modoCiudadano ? 'Tu reporte enviado' : 'Aviso ciudadano'}</span>
        {!modoCiudadano && capaSatelitalActiva && (
          <span><i className="dot dot-satelite" /> Anomalía NASA FIRMS</span>
        )}
        <span><i className="dot dot-zona" /> Zona de riesgo / Perímetro</span>
        <span><i className="dot dot-pin" /> Coordenada GPS / Pin</span>
      </div>

      {fotoAmpliada && (
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setFotoAmpliada(null)}
        >
          <div className="lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <strong>{fotoAmpliada.title}</strong>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setFotoAmpliada(null)}
              >
                Cerrar ✕
              </button>
            </div>
            <img
              src={fotoAmpliada.src}
              alt={fotoAmpliada.title}
              className="lightbox-img"
            />
          </div>
        </div>
      )}
    </section>
  );
}
