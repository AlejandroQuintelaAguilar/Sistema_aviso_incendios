import { useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';
import { haversineKm } from '../../utils/tacticalMapHelpers';

const MAPA_URGENCIA_GRAVEDAD = {
  BAJO: 'BAJA',
  MEDIO: 'MEDIA',
  ALTO: 'ALTA',
  CRITICO: 'CATASTROFICA',
};

const GRAVEDADES_TACTICAS = [
  {
    id: 'BAJA',
    titulo: 'BAJA',
    desc: 'Foco incipiente o pastizal aislado',
    brigadas: '1 brigada sugerida',
  },
  {
    id: 'MEDIA',
    titulo: 'MEDIA',
    desc: 'Incendio moderado en expansión',
    brigadas: '1 brigada sugerida',
  },
  {
    id: 'ALTA',
    titulo: 'ALTA',
    desc: 'Frente activo extenso o riesgo cercano',
    brigadas: '2 brigadas sugeridas',
  },
  {
    id: 'CATASTROFICA',
    titulo: 'CATASTRÓFICA',
    desc: 'Emergencia mayor / amenaza a viviendas o reserva',
    brigadas: '3 brigadas sugeridas',
  },
];

export function ValidarClasificarModal({
  objetivo,
  zonas = [],
  incidentesActivos = [],
  focosSatelitales = [],
  loading = false,
  onClose,
  onConfirmarAbrir,
  onConfirmarSoloVerificar,
  onVincularExistente,
}) {
  const [gravedad, setGravedad] = useState('MEDIA');
  const [idZona, setIdZona] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [fotoAmpliada, setFotoAmpliada] = useState(false);

  const esGrupo = objetivo?.tipo === 'grupo';
  const aviso = objetivo?.tipo === 'aviso' ? objetivo.aviso : null;
  const grupo = objetivo?.tipo === 'grupo' ? objetivo.grupo : null;
  const coordsObjetivo = esGrupo ? grupo?.centroide : aviso?.coordenadas;

  const zonasConDistancia = useMemo(() => {
    return zonas
      .filter((z) => z.estado !== 'Inactiva')
      .map((z) => {
        const dist =
          coordsObjetivo && z.coordenadas
            ? Number(haversineKm(coordsObjetivo, z.coordenadas).toFixed(1))
            : null;
        return { ...z, distanciaKm: dist };
      })
      .sort((a, b) => {
        const dA = a.distanciaKm ?? Number.POSITIVE_INFINITY;
        const dB = b.distanciaKm ?? Number.POSITIVE_INFINITY;
        if (dA !== dB) return dA - dB;
        return a.id_zona - b.id_zona;
      });
  }, [zonas, coordsObjetivo]);

  const zonaSeleccionadaObj = useMemo(() => {
    if (!idZona) return null;
    return zonasConDistancia.find((z) => String(z.id_zona) === String(idZona)) || null;
  }, [zonasConDistancia, idZona]);

  const incCercano = useMemo(() => {
    if (esGrupo || !aviso?.coordenadas) return null;
    let mejor = null;
    for (const inc of incidentesActivos) {
      if (inc.estado === 'CERRADO' || !inc.coordenadas) continue;
      const d = Number(haversineKm(aviso.coordenadas, inc.coordenadas).toFixed(2));
      if (d <= 3 && (!mejor || d < mejor.distKm)) {
        mejor = { inc, distKm: d };
      }
    }
    return mejor;
  }, [esGrupo, aviso, incidentesActivos]);

  const focoSatCercano = useMemo(() => {
    if (!coordsObjetivo || !Array.isArray(focosSatelitales) || focosSatelitales.length === 0) {
      return null;
    }
    let mejor = null;
    for (const f of focosSatelitales) {
      if (!f.coordenadas) continue;
      const d = Number(haversineKm(coordsObjetivo, f.coordenadas).toFixed(2));
      if (d <= 3 && (!mejor || d < mejor.distKm)) {
        mejor = { foco: f, distKm: d };
      }
    }
    return mejor;
  }, [coordsObjetivo, focosSatelitales]);

  useEffect(() => {
    if (!objetivo) return;
    setFotoAmpliada(false);
    if (objetivo.tipo === 'grupo' && objetivo.grupo) {
      const grp = objetivo.grupo;
      setGravedad(grp.gravedad_sugerida || 'ALTA');
      const zonaSugId = grp.zona_sugerida?.id_zona;
      if (zonaSugId) {
        setIdZona(String(zonaSugId));
      } else {
        const masCercana = zonasConDistancia.find(
          (z) => z.distanciaKm != null && z.distanciaKm <= 25
        );
        setIdZona(masCercana ? String(masCercana.id_zona) : '');
      }
      setUbicacion(
        `Zona Triangulada (${grp.cantidad_avisos} alarmas) — ${
          grp.zona_sugerida?.nombre || 'Sector detectado'
        }`
      );
      return;
    }

    if (objetivo.tipo === 'aviso' && objetivo.aviso) {
      const av = objetivo.aviso;
      setGravedad(MAPA_URGENCIA_GRAVEDAD[av.nivel_urgencia] || 'MEDIA');
      const masCercana = zonasConDistancia.find(
        (z) => z.distanciaKm != null && z.distanciaKm <= 25
      );
      setIdZona(masCercana ? String(masCercana.id_zona) : '');
      setUbicacion(av.ubicacion || '');
    }
  }, [objetivo, zonasConDistancia]);

  if (!objetivo) return null;

  const fotoUrl =
    !esGrupo &&
    typeof aviso?.foto === 'string' &&
    /^(https?:\/\/|data:image\/)/i.test(aviso.foto.trim())
      ? aviso.foto.trim()
      : null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!ubicacion.trim()) return;
    onConfirmarAbrir({
      gravedad,
      id_zona: idZona ? Number(idZona) : null,
      ubicacion: ubicacion.trim(),
    });
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Validar y clasificar incidente"
      onClick={onClose}
    >
      <div
        className="modal-card inc-validate-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>
              {esGrupo
                ? `Validar Grupo Triangulado (${grupo.cantidad_avisos} alarmas)`
                : `Validar y Clasificar Aviso #${aviso.id_aviso}`}
            </h2>
            <p className="subtitle">
              Revisa la evidencia reportada y confirma gravedad, zona de riesgo y ubicación oficial antes de despachar.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* 1. Evidencia del reporte */}
        <div className="inc-aviso-evidence-card">
          <div className="inc-evidence-head">
            <div className="item-meta">
              {esGrupo ? (
                <>
                  <StatusBadge value={grupo.nivel_urgencia_max} />
                  <span className="badge badge-muted">
                    Dispersión ±{grupo.radio_dispersion_km} km
                  </span>
                </>
              ) : (
                <>
                  <StatusBadge value={aviso.estado_aviso} />
                  <StatusBadge value={aviso.nivel_urgencia} />
                  {aviso.tiempo_transcurrido_min != null && (
                    <span className="badge badge-muted">
                      ⏱ {aviso.tiempo_transcurrido_min} min
                    </span>
                  )}
                  {aviso.alerta_sla && (
                    <span className="badge badge-danger">SLA &gt;15m</span>
                  )}
                </>
              )}
            </div>
            {coordsObjetivo && (
              <code className="inc-coords-pill">
                {coordsObjetivo.lat}, {coordsObjetivo.lng}
              </code>
            )}
          </div>

          <p className="inc-evidence-loc">
            <strong>Ubicación reportada:</strong>{' '}
            {esGrupo
              ? `${grupo.zona_sugerida?.nombre || 'Sector GPS'} · Avisos: ${grupo.ids_avisos
                  .map((id) => `#${id}`)
                  .join(', ')}`
              : aviso.ubicacion}
          </p>

          {!esGrupo && aviso.descripcion && (
            <p className="inc-evidence-desc">
              <strong>Descripción:</strong> {aviso.descripcion}
            </p>
          )}

          {fotoUrl && (
            <div className="inc-evidence-photo-row">
              <button
                type="button"
                className="photo-zoom-trigger"
                onClick={() => setFotoAmpliada((prev) => !prev)}
                title="Ampliar o reducir fotografía"
              >
                <img
                  src={fotoUrl}
                  alt={`Evidencia Aviso #${aviso.id_aviso}`}
                  className={fotoAmpliada ? 'evidence-preview' : 'evidence-thumb'}
                />
              </button>
              <span className="item-desc">
                {fotoAmpliada ? 'Clic en la foto para reducir' : 'Clic en la foto para ampliar'}
              </span>
            </div>
          )}
        </div>

        {incCercano && onVincularExistente && (
          <div className="inc-nearby-alert">
            <div>
              <strong>Posible incidente ya activo a {incCercano.distKm} km:</strong>{' '}
              Incidente #{incCercano.inc.id_incidente} — {incCercano.inc.ubicacion} (
              {incCercano.inc.estado} / {incCercano.inc.gravedad})
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onVincularExistente(aviso, incCercano.inc)}
              disabled={loading}
            >
              🔗 Vincular al Incidente #{incCercano.inc.id_incidente}
            </button>
          </div>
        )}

        {focoSatCercano && (
          <div className="inc-satelite-evidence" role="status">
            <strong>
              🛰️ Anomalía térmica NASA FIRMS detectada a {focoSatCercano.distKm} km
            </strong>
            <span>
              Sensor {focoSatCercano.foco.sensor} · Potencia{' '}
              <b>{focoSatCercano.foco.frp_mw} MW</b> · Temp. brillo{' '}
              <b>
                {focoSatCercano.foco.temperatura_brillo_c ?? '—'} °C
              </b>{' '}
              · Confianza <b>{focoSatCercano.foco.confianza}</b>
              {focoSatCercano.foco.es_simulado ? ' (Pasada Demo)' : ''}
            </span>
          </div>
        )}

        <form className="form-stack" onSubmit={handleSubmit}>
          {/* 2. Selector visual de Gravedad */}
          <div>
            <span className="inc-field-label">2. Clasificación de Gravedad Operativa</span>
            <div className="inc-gravity-grid" role="radiogroup" aria-label="Gravedad del incidente">
              {GRAVEDADES_TACTICAS.map((item) => {
                const activa = gravedad === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    className={`inc-gravity-card sev-${item.id.toLowerCase()} ${
                      activa ? 'is-selected' : ''
                    }`}
                    onClick={() => setGravedad(item.id)}
                  >
                    <div className="inc-gc-top">
                      <strong>{item.titulo}</strong>
                      <span>{item.brigadas}</span>
                    </div>
                    <p>{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Zona de Riesgo y Ubicación oficial */}
          <div className="inc-validate-fields">
            <label className="inc-field-group">
              <span className="inc-field-label">3. Zona de Riesgo</span>
              <select
                value={idZona}
                onChange={(e) => setIdZona(e.target.value)}
                aria-label="Zona de riesgo del incidente"
              >
                <option value="">Sin zona asignada / Auto-detectar en backend</option>
                {zonasConDistancia.map((z) => (
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
            </label>

            <label className="inc-field-group">
              <span className="inc-field-label">Ubicación oficial del incidente *</span>
              <input
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                required
                placeholder="Dirección o referencia oficial"
              />
            </label>
          </div>

          {zonaSeleccionadaObj && (
            <div className="inc-zona-telemetry-box">
              <div className="inc-zona-telemetry-head">
                <strong>🌲 {zonaSeleccionadaObj.nombre}</strong>
                {zonaSeleccionadaObj.estado === 'Alerta Emitida' && (
                  <span className="inc-zona-alerta-badge">🚨 Alerta COE Emitida</span>
                )}
              </div>
              <div className="inc-zona-telemetry-chips">
                <span>Vegetación: <b>{zonaSeleccionadaObj.tipo_vegetacion}</b></span>
                {zonaSeleccionadaObj.area_hectareas > 0 && (
                  <span>Superficie: <b>{zonaSeleccionadaObj.area_hectareas} ha</b></span>
                )}
                <span>🌡️ <b>{zonaSeleccionadaObj.temperatura} °C</b></span>
                <span>💧 <b>{zonaSeleccionadaObj.humedad}%</b></span>
                <span>💨 <b>{zonaSeleccionadaObj.velocidad_viento} km/h</b></span>
              </div>
              {zonaSeleccionadaObj.alerta_preventiva && (
                <p className="inc-zona-note">
                  <strong>Alerta ({zonaSeleccionadaObj.alerta_preventiva.nivel_alerta}):</strong>{' '}
                  {zonaSeleccionadaObj.alerta_preventiva.mensaje}
                </p>
              )}
              {zonaSeleccionadaObj.ultima_inspeccion?.recomendaciones && (
                <p className="inc-zona-note">
                  <strong>Última inspección ({zonaSeleccionadaObj.ultima_inspeccion.nivel_riesgo_observado}):</strong>{' '}
                  {zonaSeleccionadaObj.ultima_inspeccion.recomendaciones}
                </p>
              )}
            </div>
          )}

          <div className="inc-close-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>

            {!esGrupo &&
              aviso.estado_aviso === 'PENDIENTE' &&
              onConfirmarSoloVerificar && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loading}
                  onClick={() => onConfirmarSoloVerificar(aviso.id_aviso)}
                >
                  ✓ Solo marcar VERIFICADO
                </button>
              )}

            <button
              type="submit"
              disabled={loading || !ubicacion.trim()}
            >
              {loading ? 'Abriendo incidente...' : '🔥 Validar y Abrir Incidente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
