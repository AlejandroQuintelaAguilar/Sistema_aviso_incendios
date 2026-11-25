import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';
import { TacticalMap } from '../../components/common/TacticalMap';

const URGENCIAS = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'];

const PESO_URGENCIA = {
  CRITICO: 4,
  ALTO: 3,
  MEDIO: 2,
  BAJO: 1,
};

const CANALES_INGRESO = [
  { id: 'LLAMADA_119', label: 'Llamada 119 / Teléfono', icono: '📞' },
  { id: 'RADIO_VHF', label: 'Radio VHF / Estación', icono: '📻' },
  { id: 'PATRULLA', label: 'Patrulla / Vigía', icono: '🚓' },
  { id: 'OTRO', label: 'Otro canal', icono: '🌐' },
];

function compressImageToDataUrl(source, maxDim = 800, quality = 0.72) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, maxDim / Math.max(width, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(compressImageToDataUrl(img));
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function getBrowserGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('El navegador no soporta geolocalización GPS'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lng: Number(pos.coords.longitude.toFixed(4)),
          accuracy: Math.round(pos.coords.accuracy || 0),
        }),
      (err) => reject(new Error(err.message || 'No se pudo obtener ubicación GPS')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

function distanciaKm(c1, c2) {
  if (!c1 || !c2) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(c2.lat - c1.lat);
  const dLng = toRad(c2.lng - c1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(c1.lat)) * Math.cos(toRad(c2.lat)) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(a))).toFixed(2));
}

function extraerCanal(descripcion) {
  if (typeof descripcion !== 'string') return null;
  const match = descripcion.match(/\[Canal:\s*([^\]]+)\]/i);
  return match ? match[1].trim() : null;
}

function resolverReportante(aviso, personaById) {
  if (aviso.id_ciudadano && personaById.has(aviso.id_ciudadano)) {
    return personaById.get(aviso.id_ciudadano).nombre_completo;
  }
  return extraerCanal(aviso.descripcion) || 'SOS Ciudadano';
}

function esActivoTriage(estado) {
  return estado === 'PENDIENTE' || estado === 'VERIFICADO';
}

export function AvisosPanel({
  avisos = [],
  incidentesActivos = [],
  focosSatelitales = [],
  personas = [],
  zonas = [],
  gruposTriangulados = [],
  rolActivo = 'OPERADOR',
  pickedPoint = null,
  avisosCercanos = [],
  onGpsCaptured,
  onLimpiarPunto,
  filtroEstado = 'POR_ATENDER',
  onFiltroChange,
  onCrearAviso,
  onCambiarEstado,
  onSolicitarDescarte,
  onConvertirAIncidente,
  onVincularAIncidente,
  onConsolidarGrupo,
  onVerEnMapa,
  loading,
}) {
  // Estado del registro manual telefónico / radial (panel colapsable separado de la cola)
  const [mostrarRegistro, setMostrarRegistro] = useState(false);
  const [canalIngreso, setCanalIngreso] = useState('LLAMADA_119');
  const [ubicacion, setUbicacion] = useState('');
  const [contactoRef, setContactoRef] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [nivelUrgencia, setNivelUrgencia] = useState('MEDIO');
  const [idCiudadano, setIdCiudadano] = useState('');
  const [foto, setFoto] = useState('');
  const [mostrarMapaSelector, setMostrarMapaSelector] = useState(false);

  const [gpsStatus, setGpsStatus] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [camaraError, setCamaraError] = useState('');

  // Estado de la cola de Triage CAD
  const [busquedaTriage, setBusquedaTriage] = useState('');
  const [filtroUrgencia, setFiltroUrgencia] = useState('');
  const [soloSla, setSoloSla] = useState(false);
  const [ordenTriage, setOrdenTriage] = useState('prioridad');
  const [fotoAmpliada, setFotoAmpliada] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const puedeTriage = rolActivo === 'OPERADOR' || rolActivo === 'ADMIN';

  const personaById = useMemo(() => {
    const mapa = new Map();
    personas.forEach((p) => mapa.set(p.id_persona, p));
    return mapa;
  }, [personas]);

  const listaPersonas = useMemo(() => {
    const ciudadanos = personas.filter(
      (p) => p.tipo_persona === 'CIUDADANO' || !p.tipo_persona
    );
    return ciudadanos.length > 0 ? ciudadanos : personas;
  }, [personas]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCamaraActiva(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (camaraActiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [camaraActiva]);

  async function capturarGps() {
    setGpsBusy(true);
    setGpsStatus('Obteniendo señal GPS...');
    try {
      const coords = await getBrowserGps();
      onGpsCaptured?.({ lat: coords.lat, lng: coords.lng });
      setGpsStatus(
        `GPS capturado: ${coords.lat}, ${coords.lng}${
          coords.accuracy ? ` (±${coords.accuracy}m)` : ''
        }`
      );
    } catch (err) {
      setGpsStatus(
        `GPS no disponible (${err.message}). Puedes marcar la ubicación en el mapa.`
      );
    } finally {
      setGpsBusy(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCamaraError('');
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setFoto(dataUrl);
    } catch (err) {
      setCamaraError(err.message);
    } finally {
      e.target.value = '';
    }
  }

  async function abrirCamaraEnVivo() {
    setCamaraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCamaraActiva(true);
    } catch (err) {
      setCamaraError(
        `No se pudo abrir cámara en vivo (${err.message}). Usa "Adjuntar imagen".`
      );
    }
  }

  function capturarFotograma() {
    if (!videoRef.current) return;
    const dataUrl = compressImageToDataUrl(videoRef.current);
    setFoto(dataUrl);
    stopCameraStream();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!ubicacion.trim() && !pickedPoint) return;

    const canalObj =
      CANALES_INGRESO.find((c) => c.id === canalIngreso) || CANALES_INGRESO[0];
    const partesDesc = [`[Canal: ${canalObj.label}]`];
    if (contactoRef.trim()) {
      partesDesc.push(`Tel/Ref: ${contactoRef.trim()}`);
    }
    if (descripcion.trim()) {
      partesDesc.push(descripcion.trim());
    }

    await onCrearAviso({
      ubicacion: ubicacion.trim() || undefined,
      descripcion: partesDesc.join(' · '),
      nivel_urgencia: nivelUrgencia,
      id_ciudadano: idCiudadano ? Number(idCiudadano) : null,
      foto: foto.trim() || null,
      ...(pickedPoint ? { lat: pickedPoint.lat, lng: pickedPoint.lng } : {}),
    });

    setCanalIngreso('LLAMADA_119');
    setUbicacion('');
    setContactoRef('');
    setDescripcion('');
    setIdCiudadano('');
    setFoto('');
    setNivelUrgencia('MEDIO');
    setGpsStatus('');
    setCamaraError('');
    setMostrarMapaSelector(false);
    setMostrarRegistro(false);
    stopCameraStream();

    if (filtroEstado === 'ATENDIDO' || filtroEstado === 'DESCARTADO') {
      onFiltroChange?.('POR_ATENDER');
    }
  }

  const incidenteCercanoManual = useMemo(() => {
    if (!pickedPoint) return null;
    let mejor = null;
    for (const inc of incidentesActivos) {
      if (inc.estado === 'CERRADO' || !inc.coordenadas) continue;
      const d = distanciaKm(pickedPoint, inc.coordenadas);
      if (d !== null && d <= 3 && (!mejor || d < mejor.distKm)) {
        mejor = { inc, distKm: d };
      }
    }
    return mejor;
  }, [pickedPoint, incidentesActivos]);

  const contadores = useMemo(() => {
    const res = {
      POR_ATENDER: 0,
      PENDIENTE: 0,
      VERIFICADO: 0,
      ATENDIDO: 0,
      DESCARTADO: 0,
      TOTAL: avisos.length,
      SLA: 0,
    };
    for (const a of avisos) {
      if (res[a.estado_aviso] !== undefined) {
        res[a.estado_aviso] += 1;
      }
      if (esActivoTriage(a.estado_aviso)) {
        res.POR_ATENDER += 1;
        if (a.alerta_sla) res.SLA += 1;
      }
    }
    return res;
  }, [avisos]);

  const pillsEstado = [
    { id: 'POR_ATENDER', label: 'Por atender', count: contadores.POR_ATENDER },
    { id: 'PENDIENTE', label: 'Pendientes', count: contadores.PENDIENTE },
    { id: 'VERIFICADO', label: 'Verificados', count: contadores.VERIFICADO },
    { id: 'ATENDIDO', label: 'Atendidos', count: contadores.ATENDIDO },
    { id: 'DESCARTADO', label: 'Descartados', count: contadores.DESCARTADO },
    { id: '', label: 'Todos', count: contadores.TOTAL },
  ];

  const avisosFiltrados = useMemo(() => {
    const term = busquedaTriage.trim().toLowerCase();
    const cleanId = term.replace(/^#/, '');

    const filtrados = avisos.filter((av) => {
      if (filtroEstado === 'POR_ATENDER') {
        if (!esActivoTriage(av.estado_aviso)) return false;
      } else if (filtroEstado && av.estado_aviso !== filtroEstado) {
        return false;
      }

      if (filtroUrgencia && av.nivel_urgencia !== filtroUrgencia) return false;
      if (soloSla && !av.alerta_sla) return false;

      if (term) {
        const rep = resolverReportante(av, personaById).toLowerCase();
        const ubi = (av.ubicacion || '').toLowerCase();
        const desc = (av.descripcion || '').toLowerCase();
        if (
          !ubi.includes(term) &&
          !desc.includes(term) &&
          !rep.includes(term) &&
          String(av.id_aviso) !== cleanId
        ) {
          return false;
        }
      }
      return true;
    });

    const ordenados = [...filtrados];
    if (ordenTriage === 'recientes') {
      ordenados.sort((a, b) => b.id_aviso - a.id_aviso);
    } else {
      ordenados.sort((a, b) => {
        const actA = esActivoTriage(a.estado_aviso) ? 1 : 0;
        const actB = esActivoTriage(b.estado_aviso) ? 1 : 0;
        if (actA !== actB) return actB - actA;

        const slaA = a.alerta_sla ? 1 : 0;
        const slaB = b.alerta_sla ? 1 : 0;
        if (slaA !== slaB) return slaB - slaA;

        const pesoA = PESO_URGENCIA[a.nivel_urgencia] || 0;
        const pesoB = PESO_URGENCIA[b.nivel_urgencia] || 0;
        if (pesoA !== pesoB) return pesoB - pesoA;

        return b.id_aviso - a.id_aviso;
      });
    }
    return ordenados;
  }, [
    avisos,
    filtroEstado,
    filtroUrgencia,
    soloSla,
    busquedaTriage,
    ordenTriage,
    personaById,
  ]);

  return (
    <div className="view-stack">
      <section className="card">
        <div className="triage-header">
          <div>
            <h2>Consola de Triage de Avisos</h2>
            <p className="subtitle">
              Clasifica alertas entrantes, prioriza avisos atrasados (+15 min) o registra llamados telefónicos y radiales.
            </p>
          </div>
          <div className="item-actions">
            {pickedPoint && !mostrarRegistro && (
              <span className="geo-chip">
                📍 Pin activo: {pickedPoint.lat}, {pickedPoint.lng}
              </span>
            )}
            <button
              type="button"
              className={mostrarRegistro ? 'btn-secondary' : ''}
              onClick={() => setMostrarRegistro((prev) => !prev)}
            >
              {mostrarRegistro
                ? '✕ Cerrar Registro Manual'
                : '📞 + Registrar Aviso Telefónico / Radial'}
            </button>
          </div>
        </div>

        {mostrarRegistro && (
          <div className="triage-intake-card">
            <div className="triage-intake-head">
              <div>
                <strong>Registro de Aviso Telefónico / Radial</strong>
                <p className="subtitle">
                  Ingresa reportes recibidos por línea 119, radio de estación, patrulla o vigía comunal.
                </p>
              </div>
            </div>

            <div className="triage-intake-group">
              <span className="kpi-label">Canal de ingreso</span>
              <div className="triage-channel-pills">
                {CANALES_INGRESO.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`triage-pill ${canalIngreso === c.id ? 'active' : ''}`}
                    onClick={() => setCanalIngreso(c.id)}
                  >
                    {c.icono} {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="triage-intake-group">
              <span className="kpi-label">Urgencia inicial reportada</span>
              <div className="triage-channel-pills">
                {URGENCIAS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`triage-pill ${nivelUrgencia === u ? 'active' : ''}`}
                    onClick={() => setNivelUrgencia(u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <form className="triage-intake-form" onSubmit={handleSubmit}>
              <div className="triage-intake-grid">
                <input
                  type="text"
                  placeholder={
                    pickedPoint
                      ? 'Ubicación / sector (opcional con pin activo)'
                      : 'Ubicación / sector reportado *'
                  }
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value)}
                  required={!pickedPoint}
                />
                <input
                  type="text"
                  placeholder="Teléfono o indicativo radial de contacto (opcional)"
                  value={contactoRef}
                  onChange={(e) => setContactoRef(e.target.value)}
                />
                <select
                  value={idCiudadano}
                  onChange={(e) => setIdCiudadano(e.target.value)}
                >
                  <option value="">Reportante registrado (opcional / anónimo)</option>
                  {listaPersonas.map((p) => (
                    <option key={p.id_persona} value={p.id_persona}>
                      {p.nombre_completo} (#{p.id_persona})
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                rows={2}
                placeholder="Relato del llamado / observaciones operativas (ej. llamas visibles cerca de quebrada, viento norte...)"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />

              <div className="capture-toolbar">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setMostrarMapaSelector((prev) => !prev)}
                  disabled={loading}
                >
                  {mostrarMapaSelector ? '✕ Ocultar Mapa' : '🗺️ Marcar en Mapa'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={capturarGps}
                  disabled={gpsBusy || loading}
                >
                  {gpsBusy ? 'Buscando GPS...' : '📍 Mi GPS'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  📎 Adjuntar Imagen
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={camaraActiva ? stopCameraStream : abrirCamaraEnVivo}
                  disabled={loading}
                >
                  {camaraActiva ? 'Cerrar Cámara' : '🎥 Cámara en Vivo'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden-input"
                  onChange={handleFileChange}
                />
              </div>

              {gpsStatus && <div className="gps-status">{gpsStatus}</div>}

              {pickedPoint && (
                <div className="geo-chip" style={{ justifyContent: 'space-between' }}>
                  <span>
                    Coordenadas seleccionadas:{' '}
                    <strong>
                      {pickedPoint.lat}, {pickedPoint.lng}
                    </strong>
                  </span>
                  {onLimpiarPunto && (
                    <button
                      type="button"
                      className="btn-secondary btn-xs"
                      onClick={onLimpiarPunto}
                    >
                      ✕ Quitar punto
                    </button>
                  )}
                </div>
              )}

              {mostrarMapaSelector && (
                <TacticalMap
                  zonas={zonas}
                  avisos={[]}
                  incidentes={[]}
                  selectedIncidenteId={null}
                  pickedPoint={pickedPoint}
                  onPickPoint={onGpsCaptured}
                  modoCiudadano
                />
              )}

              {camaraError && <div className="alert-warn">{camaraError}</div>}

              {camaraActiva && (
                <div className="camera-box">
                  <video ref={videoRef} autoPlay playsInline muted className="video-preview" />
                  <div className="item-actions">
                    <button type="button" onClick={capturarFotograma}>
                      📸 Capturar Foto
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={stopCameraStream}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {foto && /^(https?:\/\/|data:image\/)/i.test(foto) && (
                <div className="camera-preview-box">
                  <img src={foto} alt="Vista previa" className="evidence-thumb" />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setFoto('')}
                  >
                    Quitar foto
                  </button>
                </div>
              )}

              {avisosCercanos.length > 0 && (
                <div className="alert-warn">
                  <strong>Posible aviso duplicado cercano (≤ 3 km):</strong>{' '}
                  {avisosCercanos
                    .map(
                      (a) =>
                        `#${a.id_aviso} (${a.estado_aviso}, a ${a.distancia_km} km)`
                    )
                    .join(' · ')}
                </div>
              )}

              {incidenteCercanoManual && (
                <div className="alert-warn">
                  <strong>
                    ℹ️ Incidente activo cercano (#{incidenteCercanoManual.inc.id_incidente} a{' '}
                    {incidenteCercanoManual.distKm} km):
                  </strong>{' '}
                  {incidenteCercanoManual.inc.ubicacion}. Verifica si el llamado corresponde al mismo evento antes de abrir otro caso.
                </div>
              )}

              <div className="item-actions">
                <button
                  type="submit"
                  disabled={loading || (!ubicacion.trim() && !pickedPoint)}
                >
                  Registrar Aviso en Cola de Triage
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    stopCameraStream();
                    setMostrarMapaSelector(false);
                    setMostrarRegistro(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {gruposTriangulados.length > 0 && (
        <section className="card triage-clusters-strip">
          <div className="triage-clusters-head">
            <div>
              <strong>
                🎯 {gruposTriangulados.length} foco(s) triangulado(s) pendientes de consolidación
              </strong>
              <p className="subtitle">
                Múltiples alertas a ≤ 2.5 km pueden consolidarse en un único incidente para evitar despachos duplicados.
              </p>
            </div>
          </div>
          <div className="list-stack">
            {gruposTriangulados.map((grp) => (
              <div key={grp.id_grupo} className="triage-cluster-row">
                <div>
                  <strong>
                    Grupo #{grp.id_grupo} · {grp.cantidad_avisos} avisos agrupados
                  </strong>{' '}
                  — {grp.zona_sugerida?.nombre || 'Sector detectado por GPS'}{' '}
                  <StatusBadge value={grp.nivel_urgencia_max} />
                </div>
                <div className="item-actions">
                  {onVerEnMapa && (
                    <button
                      type="button"
                      className="btn-secondary btn-xs"
                      onClick={() => onVerEnMapa(grp.centroide)}
                    >
                      📍 Ver en Mapa
                    </button>
                  )}
                  {puedeTriage && onConsolidarGrupo && (
                    <button
                      type="button"
                      className="btn-xs"
                      onClick={() => onConsolidarGrupo(grp)}
                      disabled={loading}
                    >
                      ⚡ Consolidar en 1 Incidente
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="triage-state-pills" role="tablist" aria-label="Filtrar avisos por estado">
          {pillsEstado.map((p) => (
            <button
              key={p.id || 'TODOS'}
              type="button"
              className={`triage-pill ${filtroEstado === p.id ? 'active' : ''}`}
              onClick={() => onFiltroChange?.(p.id)}
            >
              <span>{p.label}</span>
              <span className="triage-pill-count">{p.count}</span>
            </button>
          ))}
        </div>

        <div className="triage-toolbar">
          <input
            type="search"
            className="triage-search-input"
            placeholder="Buscar por #folio, ubicación, descripción o reportante..."
            value={busquedaTriage}
            onChange={(e) => setBusquedaTriage(e.target.value)}
            aria-label="Buscar en la cola de triage"
          />

          <div className="triage-channel-pills">
            <button
              type="button"
              className={`triage-pill ${filtroUrgencia === '' ? 'active' : ''}`}
              onClick={() => setFiltroUrgencia('')}
            >
              Todas
            </button>
            {URGENCIAS.map((u) => (
              <button
                key={u}
                type="button"
                className={`triage-pill ${filtroUrgencia === u ? 'active' : ''}`}
                onClick={() => setFiltroUrgencia(u)}
              >
                {u}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`triage-pill ${soloSla ? 'active' : ''} ${
              contadores.SLA > 0 ? 'sla-alert' : ''
            }`}
            onClick={() => setSoloSla((prev) => !prev)}
          >
            ⏱ Solo atrasados (+15 min) ({contadores.SLA})
          </button>

          <select
            value={ordenTriage}
            onChange={(e) => setOrdenTriage(e.target.value)}
            aria-label="Ordenar cola de triage"
          >
            <option value="prioridad">Orden: Prioridad CAD</option>
            <option value="recientes">Orden: Más recientes</option>
          </select>
        </div>

        <div className="list-stack" style={{ marginTop: '0.85rem' }}>
          {avisosFiltrados.length === 0 ? (
            <p className="empty-text">
              No hay avisos que coincidan con los filtros actuales.
            </p>
          ) : (
            avisosFiltrados.map((aviso) => {
              let incCercano = null;
              if (aviso.coordenadas && esActivoTriage(aviso.estado_aviso)) {
                for (const inc of incidentesActivos) {
                  if (inc.estado === 'CERRADO' || !inc.coordenadas) continue;
                  const d = distanciaKm(aviso.coordenadas, inc.coordenadas);
                  if (d !== null && d <= 3 && (!incCercano || d < incCercano.distKm)) {
                    incCercano = { inc, distKm: d };
                  }
                }
              }

              let satCercano = null;
              if (
                aviso.coordenadas &&
                esActivoTriage(aviso.estado_aviso) &&
                Array.isArray(focosSatelitales)
              ) {
                for (const f of focosSatelitales) {
                  if (!f.coordenadas) continue;
                  const d = distanciaKm(aviso.coordenadas, f.coordenadas);
                  if (d !== null && d <= 3 && (!satCercano || d < satCercano.distKm)) {
                    satCercano = { foco: f, distKm: d };
                  }
                }
              }

              const canal = extraerCanal(aviso.descripcion);
              const reportante = resolverReportante(aviso, personaById);
              const urgClass = (aviso.nivel_urgencia || 'MEDIO').toLowerCase();

              return (
                <article
                  key={aviso.id_aviso}
                  className={`item-row triage-card urg-${urgClass} ${
                    aviso.alerta_sla ? 'triage-card-sla' : ''
                  }`}
                >
                  <div className="item-main">
                    <div className="item-title">
                      <strong>#{aviso.id_aviso}</strong> — {aviso.ubicacion_legible || aviso.ubicacion}{' '}
                      <span className="triage-origin-chip">
                        {canal
                          ? aviso.id_ciudadano
                            ? `${canal} · ${reportante}`
                            : canal
                          : aviso.id_ciudadano
                          ? `👤 ${reportante}`
                          : '📱 SOS Ciudadano'}
                      </span>
                    </div>

                    {aviso.descripcion && (
                      <p className="item-desc">{aviso.descripcion}</p>
                    )}

                    {aviso.foto && (
                      <div className="evidence-inline">
                        {!aviso.foto.startsWith('data:image/') && (
                          <span className="item-desc">Foto: {aviso.foto}</span>
                        )}
                        {/^(https?:\/\/|data:image\/)/i.test(aviso.foto) && (
                          <img
                            src={aviso.foto}
                            alt={`Aviso ${aviso.id_aviso}`}
                            className="evidence-thumb tp-photo-zoomable"
                            title="Haz clic para ampliar fotografía"
                            onClick={() =>
                              setFotoAmpliada({
                                src: aviso.foto,
                                title: `Aviso #${aviso.id_aviso} — ${
                                  aviso.ubicacion_legible || aviso.ubicacion
                                }`,
                              })
                            }
                          />
                        )}
                      </div>
                    )}

                    <div className="item-meta">
                      <StatusBadge value={aviso.nivel_urgencia} />
                      <StatusBadge value={aviso.estado_aviso} />
                      {aviso.tiempo_transcurrido_min != null && (
                        <span className="badge badge-muted">
                          ⏱ {aviso.tiempo_transcurrido_min} min
                        </span>
                      )}
                      {aviso.alerta_sla && (
                        <span className="badge badge-danger">Atrasado (+15 min)</span>
                      )}
                      {incCercano && (
                        <span className="badge badge-warn">
                          🔗 A {incCercano.distKm} km de Inc. #{incCercano.inc.id_incidente}
                        </span>
                      )}
                      {satCercano && (
                        <span className="badge badge-satelite">
                          🛰️ FIRMS a {satCercano.distKm} km ({satCercano.foco.frp_mw} MW · Conf.{' '}
                          {satCercano.foco.confianza})
                        </span>
                      )}
                    </div>
                  </div>

                  {puedeTriage && (
                    <div className="item-actions">
                      {aviso.coordenadas && onVerEnMapa && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onVerEnMapa(aviso.coordenadas)}
                        >
                          📍 Mapa
                        </button>
                      )}
                      {incCercano && onVincularAIncidente && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onVincularAIncidente(aviso, incCercano.inc)}
                          disabled={loading}
                          title="Marcar aviso como ATENDIDO vinculándolo al incidente activo cercano"
                        >
                          🔗 Vincular a Inc. #{incCercano.inc.id_incidente}
                        </button>
                      )}
                      {aviso.estado_aviso === 'PENDIENTE' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onCambiarEstado(aviso.id_aviso, 'VERIFICADO')}
                          disabled={loading}
                        >
                          Verificar
                        </button>
                      )}
                      {esActivoTriage(aviso.estado_aviso) && (
                        <>
                          <button
                            type="button"
                            onClick={() => onConvertirAIncidente(aviso)}
                            disabled={loading}
                          >
                            Validar y Abrir Incidente
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() =>
                              onSolicitarDescarte
                                ? onSolicitarDescarte(aviso)
                                : onCambiarEstado(aviso.id_aviso, 'DESCARTADO')
                            }
                            disabled={loading}
                          >
                            Falso aviso
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

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
    </div>
  );
}
