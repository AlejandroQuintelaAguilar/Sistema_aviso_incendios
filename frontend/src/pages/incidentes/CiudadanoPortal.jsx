import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';
import { TacticalMap } from '../../components/common/TacticalMap';
import { limpiarUbicacionCiudadano } from '../../utils/tacticalMapHelpers';
import { MensajeIncendioPanel } from './MensajeIncendioPanel';

const DESCRIPCIONES_GENERICAS = new Set([
  'Alerta SOS enviada en 1 toque sin sesión',
  'Alerta enviada con ubicación manual en mapa',
]);

function esDescripcionPersonalizada(aviso) {
  const texto = (aviso?.descripcion || '').trim();
  return Boolean(texto) && !DESCRIPCIONES_GENERICAS.has(texto);
}

function formatFechaCorta(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function calcularBrilloPromedio(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let suma = 0;
  let muestras = 0;
  // Muestrear cada 4 píxeles (16 bytes) para mantener respuesta instantánea en móvil
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    suma += 0.299 * r + 0.587 * g + 0.114 * b;
    muestras += 1;
  }
  return muestras > 0 ? suma / muestras : 0;
}

function capturarFotogramaVerificado(videoEl, { idAviso, coordenadas }) {
  const width = videoEl.videoWidth || videoEl.width || 640;
  const height = videoEl.videoHeight || videoEl.height || 480;
  const maxDim = 800;
  const scale = Math.min(1, maxDim / Math.max(width, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  const brillo = calcularBrilloPromedio(ctx, canvas.width, canvas.height);
  if (brillo < 12) {
    throw new Error(
      'La captura está demasiado oscura o el lente parece cubierto. Enfoca la escena e intenta de nuevo.'
    );
  }

  // Estampar marca de agua verificable (hora exacta + GPS + folio)
  const bandHeight = Math.max(28, Math.round(canvas.height * 0.08));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(0, canvas.height - bandHeight, canvas.width, bandHeight);

  const fontSize = Math.max(11, Math.round(bandHeight * 0.42));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#f8fafc';
  ctx.textBaseline = 'middle';

  const fechaTxt = new Date().toLocaleString();
  const gpsTxt = coordenadas
    ? `GPS: ${Number(coordenadas.lat).toFixed(4)}, ${Number(coordenadas.lng).toFixed(4)}`
    : 'GPS: referencial';
  const marca = `EN VIVO · #${idAviso} · ${fechaTxt} · ${gpsTxt}`;
  ctx.fillText(marca, 10, canvas.height - bandHeight / 2, canvas.width - 20);

  return canvas.toDataURL('image/jpeg', 0.72);
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
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
  });
}

export function CiudadanoPortal({
  zonas = [],
  avisoActivo = null,
  misAvisos = [],
  avisosCercanos = [],
  usuarioAutenticado = null,
  pickedPoint = null,
  onGpsCaptured,
  onIniciarReporteSos,
  onAdjuntarFoto,
  onEnviarDescripcion,
  onSeleccionarAviso,
  onNuevoReporte,
  loading = false,
}) {
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsNotice, setGpsNotice] = useState('');
  const [gpsFallback, setGpsFallback] = useState(false);
  const [camaraActiva, setCamaraActiva] = useState(false);
  const [camaraError, setCamaraError] = useState('');
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [otraUbicacionAbierta, setOtraUbicacionAbierta] = useState(false);
  const [otraUbicacionTexto, setOtraUbicacionTexto] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const esCiudadanoAutenticado = usuarioAutenticado?.rol === 'CIUDADANO';
  const nombreCiudadano =
    [usuarioAutenticado?.persona?.nombres, usuarioAutenticado?.persona?.apellidos]
      .filter(Boolean)
      .join(' ') ||
    usuarioAutenticado?.nombre_usuario ||
    '';

  const otrosCercanos = (avisosCercanos || []).filter(
    (item) => item.id_aviso !== avisoActivo?.id_aviso
  );
  const distanciaMinimaKm = otrosCercanos.reduce(
    (min, item) =>
      typeof item.distancia_km === 'number' && item.distancia_km < min
        ? item.distancia_km
        : min,
    Infinity
  );

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

  function handlePointPicked(pt) {
    setGpsFallback(false);
    setGpsNotice(pt ? 'Ubicación marcada en el mapa.' : '');
    onGpsCaptured?.(pt);
  }

  async function handleClickReportar() {
    setGpsBusy(true);
    setGpsFallback(false);
    setGpsNotice('Obteniendo tu ubicación...');
    let coords = pickedPoint;
    if (!coords) {
      try {
        const gps = await getBrowserGps();
        coords = { lat: gps.lat, lng: gps.lng };
        setGpsFallback(false);
        setGpsNotice('');
      } catch {
        coords = { lat: -17.314, lng: -66.181 };
        setGpsFallback(true);
        setGpsNotice(
          'No pudimos obtener tu ubicación exacta; se envió una ubicación aproximada.'
        );
      }
      onGpsCaptured?.(coords);
    }

    try {
      await onIniciarReporteSos({
        lat: coords.lat,
        lng: coords.lng,
        descripcion: 'Alerta SOS enviada en 1 toque sin sesión',
        nivel_urgencia: 'ALTO',
      });
    } finally {
      setGpsBusy(false);
    }
  }

  async function abrirCamaraEnVivo() {
    setCamaraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamaraError(
        'Por seguridad solo se permite capturar fotografía en tiempo real desde la cámara, y este navegador no la soporta. Puedes continuar directamente con el Paso 3 para dictar por voz o escribir los detalles.'
      );
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
        `No se pudo abrir la cámara en vivo (${err.message}). Por seguridad no se permite subir fotos de galería. Puedes continuar directamente con el Paso 3 para dictar por voz o escribir los detalles.`
      );
    }
  }

  async function capturarFotograma() {
    if (!videoRef.current || !avisoActivo) return;
    setCamaraError('');
    try {
      const coords = avisoActivo.coordenadas || pickedPoint || null;
      const dataUrl = capturarFotogramaVerificado(videoRef.current, {
        idAviso: avisoActivo.id_aviso,
        coordenadas: coords,
      });
      stopCameraStream();
      await onAdjuntarFoto(avisoActivo.id_aviso, dataUrl);
    } catch (err) {
      setCamaraError(err.message);
    }
  }

  async function handleReportarOtraUbicacion(e) {
    e.preventDefault();
    if (!pickedPoint && !otraUbicacionTexto.trim()) return;
    setGpsFallback(false);
    await onIniciarReporteSos({
      ubicacion: otraUbicacionTexto.trim() || undefined,
      ...(pickedPoint ? { lat: pickedPoint.lat, lng: pickedPoint.lng } : {}),
      descripcion: 'Alerta enviada con ubicación manual en mapa',
      nivel_urgencia: 'ALTO',
    });
    setOtraUbicacionAbierta(false);
    setOtraUbicacionTexto('');
  }

  function resetParaNuevoReporte() {
    stopCameraStream();
    setMostrarMapa(false);
    setGpsFallback(false);
    setGpsNotice('');
    setCamaraError('');
    onNuevoReporte?.();
  }

  function renderIdentityBadge() {
    if (esCiudadanoAutenticado) {
      return (
        <div className="citizen-identity-row">
          <span className="citizen-identity-pill is-auth">
            👤 Reportando como: {nombreCiudadano}
          </span>
        </div>
      );
    }
    return (
      <div className="citizen-identity-row">
        <span className="citizen-identity-pill is-anon">
          EMERGENCIA · MODO SOS ANÓNIMO
          {usuarioAutenticado ? ' · VISTA PREVIA' : ''}
        </span>
      </div>
    );
  }

  function renderStepper() {
    const tieneAviso = Boolean(avisoActivo);
    const tieneFoto = Boolean(avisoActivo?.foto);
    const tieneDetalles = esDescripcionPersonalizada(avisoActivo);
    const descartado = avisoActivo?.estado_aviso === 'DESCARTADO';

    const estadoPaso1 = tieneAviso ? 'done' : 'active';
    const estadoPaso2 = tieneFoto
      ? 'done'
      : tieneAviso && !descartado
      ? 'active'
      : '';
    const estadoPaso3 = tieneDetalles
      ? 'done'
      : tieneAviso && !descartado
      ? 'active'
      : '';

    return (
      <div className="citizen-stepper" aria-label="Pasos del reporte ciudadano">
        <div className={`citizen-step ${estadoPaso1}`}>
          <span className="citizen-step-num">{tieneAviso ? '✓' : '1'}</span>
          <div className="citizen-step-text">
            <strong>1. Ubicación SOS</strong>
            <small>{tieneAviso ? 'Ubicación registrada' : 'GPS o mapa táctico'}</small>
          </div>
        </div>
        <div className={`citizen-step ${estadoPaso2}`}>
          <span className="citizen-step-num">{tieneFoto ? '✓' : '2'}</span>
          <div className="citizen-step-text">
            <strong>2. Foto en vivo</strong>
            <small>{tieneFoto ? 'Evidencia adjunta' : 'Opcional con cámara'}</small>
          </div>
        </div>
        <div className={`citizen-step ${estadoPaso3}`}>
          <span className="citizen-step-num">{tieneDetalles ? '✓' : '3'}</span>
          <div className="citizen-step-text">
            <strong>3. Detalles / Voz</strong>
            <small>{tieneDetalles ? 'Detalles enviados' : 'Dictado o texto'}</small>
          </div>
        </div>
      </div>
    );
  }

  function renderNearbyAlert() {
    if (otrosCercanos.length === 0) return null;
    if (!avisoActivo) {
      return (
        <div className="citizen-nearby-box" role="status">
          <strong>
            ⚠️ La central ya detectó {otrosCercanos.length} reporte(s) activo(s) en este sector
            {Number.isFinite(distanciaMinimaKm) ? ` (a ${distanciaMinimaKm} km)` : ''}
          </strong>
          <span>
            Si estás viendo llamas o humo, puedes enviar tu alerta igualmente para reforzar la triangulación o sumar foto/voz en el siguiente paso.
          </span>
        </div>
      );
    }
    return (
      <div className="citizen-nearby-box" role="status">
        <strong>
          ℹ️ La central ya recibió otros {otrosCercanos.length} reporte(s) en esta zona
        </strong>
        <span>
          Puedes sumar tu fotografía en vivo o dictar los detalles por voz para ayudar a los bomberos.
        </span>
      </div>
    );
  }

  if (!avisoActivo) {
    return (
      <div className="citizen-landing">
        <section
          className={`card citizen-hero-card ${
            otraUbicacionAbierta ? 'citizen-hero-wide' : ''
          }`}
        >
          {renderIdentityBadge()}
          <h2>¿Ves un incendio o columna de humo?</h2>
          <p className="subtitle">
            Envía tu alerta inmediata con ubicación GPS a la central de bomberos. Luego podrás adjuntar una foto en vivo y dictar los detalles por voz.
          </p>

          {renderStepper()}

          <button
            type="button"
            className="btn-sos citizen-hero-btn"
            onClick={handleClickReportar}
            disabled={loading || gpsBusy}
          >
            {gpsBusy
              ? '⏳ ENVIANDO ALERTA Y GPS...'
              : '🚨 REPORTAR INCENDIO AHORA'}
          </button>

          <button
            type="button"
            className="btn-secondary citizen-alt-location-btn"
            onClick={() => setOtraUbicacionAbierta((prev) => !prev)}
            disabled={loading || gpsBusy}
          >
            {otraUbicacionAbierta
              ? '✕ Cancelar otra ubicación'
              : '📍 Reportar incendio en otra ubicación'}
          </button>

          {otraUbicacionAbierta && (
            <form className="citizen-other-loc-box" onSubmit={handleReportarOtraUbicacion}>
              <input
                type="text"
                className="citizen-other-loc-input"
                placeholder="Referencia del lugar (opcional si marcas en mapa)"
                value={otraUbicacionTexto}
                onChange={(e) => setOtraUbicacionTexto(e.target.value)}
              />
              {renderNearbyAlert()}
              <TacticalMap
                zonas={zonas}
                avisos={[]}
                incidentes={[]}
                selectedIncidenteId={null}
                pickedPoint={pickedPoint}
                onSelectIncidente={undefined}
                onPickPoint={handlePointPicked}
                modoCiudadano
              />
              <button
                type="submit"
                className="citizen-other-loc-submit"
                disabled={loading || (!pickedPoint && !otraUbicacionTexto.trim())}
              >
                🚨 Enviar en Ubicación Marcada
              </button>
            </form>
          )}

          {gpsNotice && <div className="gps-status">{gpsNotice}</div>}

          {misAvisos.length > 0 && (
            <div className="citizen-previous-box">
              <span className="kpi-label">
                {esCiudadanoAutenticado
                  ? 'Tus reportes registrados (haz clic para seguir estado):'
                  : 'Reportes enviados en esta sesión (haz clic para seguir estado):'}
              </span>
              <div className="list-stack">
                {misAvisos.map((av) => (
                  <button
                    key={av.id_aviso}
                    type="button"
                    className="citizen-history-item"
                    onClick={() => {
                      stopCameraStream();
                      setMostrarMapa(false);
                      setGpsFallback(false);
                      onSeleccionarAviso?.(av.id_aviso);
                    }}
                  >
                    <div>
                      <div>
                        <strong>#{av.id_aviso}</strong> — {limpiarUbicacionCiudadano(av.ubicacion)}
                      </div>
                      <div className="citizen-history-meta">
                        {formatFechaCorta(av.fecha_hora)}
                        {av.foto ? ' · 📷 Con foto' : ''}
                        {esDescripcionPersonalizada(av) ? ' · 📝 Con detalles' : ''}
                      </div>
                    </div>
                    <div className="citizen-history-badges">
                      <StatusBadge value={av.estado_aviso} />
                      <StatusBadge value={av.nivel_urgencia} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  const estado = avisoActivo.estado_aviso;
  const esDescartado = estado === 'DESCARTADO';
  const esAtendido = estado === 'ATENDIDO';
  const esVerificado = estado === 'VERIFICADO' || esAtendido;

  const estadoTexto = esDescartado
    ? 'La central revisó y descartó este reporte. Si detectas otro foco activo, inicia un nuevo reporte.'
    : esAtendido
    ? '🚒 La central convirtió tu reporte en incidente y está gestionando la atención operativa.'
    : estado === 'VERIFICADO'
    ? '✓ Tu reporte fue verificado por la central y está priorizado para despacho.'
    : '⏳ Reporte recibido en central. El estado se actualiza automáticamente en vivo.';

  return (
    <div className="view-stack">
      <section
        className={`card citizen-confirmed-bar ${
          esDescartado ? 'citizen-discarded-bar' : ''
        }`}
      >
        <div className="citizen-confirmed-main">
          {renderIdentityBadge()}
          <div className="item-title citizen-confirmed-title">
            <strong>
              {esDescartado
                ? `Reporte #${avisoActivo.id_aviso} descartado por la central`
                : `✅ Reporte #${avisoActivo.id_aviso} enviado a la central`}
            </strong>{' '}
            <StatusBadge value={avisoActivo.estado_aviso} />
            <StatusBadge value={avisoActivo.nivel_urgencia} />
          </div>
          <p className="subtitle">
            Ubicación: {limpiarUbicacionCiudadano(avisoActivo.ubicacion)}
          </p>
          {gpsFallback && !esDescartado && (
            <div className="alert-warn citizen-inline-warn">
              No pudimos obtener tu ubicación exacta. Describe la referencia del lugar en el Paso 3 o inicia un nuevo reporte marcando el punto en el mapa.
            </div>
          )}

          {!esDescartado && (
            <div className="citizen-status-track" aria-label="Seguimiento en vivo del reporte">
              <div className={`citizen-status-node ${esVerificado ? 'done' : 'active'}`}>
                <span>{esVerificado ? '✓' : '●'}</span>
                <span>1. Enviado</span>
              </div>
              <div
                className={`citizen-status-node ${
                  esAtendido ? 'done' : estado === 'VERIFICADO' ? 'active' : ''
                }`}
              >
                <span>{esAtendido ? '✓' : estado === 'VERIFICADO' ? '●' : '○'}</span>
                <span>2. Verificado por central</span>
              </div>
              <div className={`citizen-status-node ${esAtendido ? 'done' : ''}`}>
                <span>{esAtendido ? '✓' : '○'}</span>
                <span>3. Atendido / En gestión</span>
              </div>
            </div>
          )}
          <p className="citizen-status-caption">{estadoTexto}</p>
        </div>

        <div className="item-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setMostrarMapa((prev) => !prev)}
          >
            {mostrarMapa ? 'Ocultar Mapa' : '📍 Ver Ubicación en Mapa'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={resetParaNuevoReporte}
          >
            ← Nuevo Reporte
          </button>
        </div>
      </section>

      {renderStepper()}
      {!esDescartado && renderNearbyAlert()}

      {mostrarMapa && (
        <TacticalMap
          zonas={zonas}
          avisos={[avisoActivo]}
          incidentes={[]}
          selectedIncidenteId={null}
          pickedPoint={pickedPoint}
          onSelectIncidente={undefined}
          onPickPoint={handlePointPicked}
          modoCiudadano
        />
      )}

      {esDescartado ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Resumen del reporte #{avisoActivo.id_aviso}</h2>
              <p className="subtitle">
                Los reportes descartados quedan en solo lectura.
              </p>
            </div>
            <button type="button" onClick={resetParaNuevoReporte}>
              🚨 Iniciar Nuevo Reporte
            </button>
          </div>
          {avisoActivo.descripcion && (
            <p className="subtitle" style={{ marginTop: '0.5rem' }}>
              <strong>Detalles registrados:</strong> {avisoActivo.descripcion}
            </p>
          )}
          {avisoActivo.foto && /^(https?:\/\/|data:image\/)/i.test(avisoActivo.foto) && (
            <div className="camera-preview-box">
              <img
                src={avisoActivo.foto}
                alt={`Evidencia reporte #${avisoActivo.id_aviso}`}
                className="evidence-preview"
              />
            </div>
          )}
        </section>
      ) : (
        <div className="citizen-post-grid">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>📷 Captura de Cámara en Vivo</h2>
                <p className="subtitle">
                  Por seguridad solo se permite cámara en tiempo real: se valida iluminación mínima y se estampa hora y GPS en la foto.
                </p>
              </div>
            </div>

            <div className="capture-toolbar">
              <button
                type="button"
                onClick={camaraActiva ? stopCameraStream : abrirCamaraEnVivo}
                disabled={loading}
              >
                {camaraActiva ? 'Cerrar Cámara' : '🎥 Abrir Cámara en Vivo'}
              </button>
            </div>

            {camaraError && <div className="alert-warn">{camaraError}</div>}

            {camaraActiva && (
              <div className="camera-box">
                <video ref={videoRef} autoPlay playsInline muted className="video-preview" />
                <div className="item-actions">
                  <button type="button" onClick={capturarFotograma} disabled={loading}>
                    📸 Capturar y Adjuntar Foto
                  </button>
                  <button type="button" className="btn-secondary" onClick={stopCameraStream}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {avisoActivo.foto ? (
              <div className="camera-preview-box">
                {/^(https?:\/\/|data:image\/)/i.test(avisoActivo.foto) ? (
                  <img
                    src={avisoActivo.foto}
                    alt={`Evidencia reporte #${avisoActivo.id_aviso}`}
                    className="evidence-preview"
                  />
                ) : (
                  <span>Foto adjunta: {avisoActivo.foto}</span>
                )}
                <span className="badge badge-muted">✓ Foto guardada en reporte #{avisoActivo.id_aviso}</span>
              </div>
            ) : (
              <p className="empty-text">
                Aún no adjuntaste fotografía a este reporte (opcional).
              </p>
            )}
          </section>

          <MensajeIncendioPanel
            ultimoAviso={avisoActivo}
            pickedPoint={pickedPoint}
            onEnviarDescripcion={onEnviarDescripcion}
            onDesvincularAviso={resetParaNuevoReporte}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}
