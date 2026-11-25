import { useState } from 'react';
import { limpiarUbicacionCiudadano } from '../../utils/tacticalMapHelpers';

function claseBadgeEstado(estado) {
  const val = String(estado || '').toUpperCase();
  if (val === 'ACTIVO' || val === 'CRITICO' || val === 'SIN REPORTE') return 'is-danger';
  if (val === 'PENDIENTE' || val === 'ALTO' || val === 'CONTROLADO') return 'is-warn';
  if (
    val === 'VERIFICADO' ||
    val === 'TRIANGULADO' ||
    val === 'EN TRIAGE' ||
    val === 'EN INCIDENTE'
  ) {
    return 'is-info';
  }
  if (val === 'EXTINGUIDO' || val === 'CERRADO') return 'is-ok';
  return 'is-muted';
}

export function TacticalDrawer({
  foco,
  detalle,
  modoCiudadano = false,
  loading = false,
  onClose,
  onAmpliarFoto,
  onEnfocarCoords,
  onVerificarAviso,
  onConvertirAviso,
  onGestionarIncidente,
  onConsolidarGrupo,
  onCrearAvisoDesdeSatelite,
}) {
  const [expandidoMovil, setExpandidoMovil] = useState(false);

  if (!foco || !detalle) return null;

  const { cabecera, metricas, historial } = detalle;
  const raw = foco.raw || {};

  return (
    <aside
      className={`tac-drawer ${expandidoMovil ? 'is-expanded' : ''}`}
      role="dialog"
      aria-label={`Detalles de ${cabecera.titulo}`}
    >
      <div className="tac-drawer-sheet-bar">
        <button
          type="button"
          className="tac-drawer-handle-btn"
          onClick={() => setExpandidoMovil((prev) => !prev)}
          aria-label={expandidoMovil ? 'Contraer tarjeta' : 'Expandir tarjeta'}
        >
          <span className="tac-drawer-handle-pill" />
          <span className="tac-drawer-handle-label">
            {expandidoMovil ? 'Contraer detalle' : 'Deslizar / ampliar detalle'}
          </span>
        </button>
      </div>

      <div className="tac-drawer-scroll">
        {/* 1. Cabecera crítica */}
        <header className="tac-drawer-header">
          <div className="tac-drawer-badges">
            <span className={`tac-pill ${claseBadgeEstado(cabecera.estado)}`}>
              {cabecera.estado}
            </span>
            <span className={`tac-pill ${claseBadgeEstado(cabecera.nivelAlerta)}`}>
              Alerta: {cabecera.nivelAlerta}
            </span>
            {cabecera.alertaSla && (
              <span className="tac-pill is-danger">Atrasado (+15 min)</span>
            )}
          </div>

          <button
            type="button"
            className="tac-drawer-close"
            onClick={onClose}
            aria-label="Cerrar panel de detalle"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </header>

        <div className="tac-drawer-title-block">
          <h3>{cabecera.titulo}</h3>
          <p className="tac-drawer-location">
            📍{' '}
            {modoCiudadano
              ? limpiarUbicacionCiudadano(cabecera.ubicacion)
              : cabecera.ubicacion}
          </p>
          <div className="tac-drawer-submeta">
            <span>{cabecera.subtitulo}</span>
            {!modoCiudadano && cabecera.lat != null && cabecera.lng != null && (
              <code>
                {Number(cabecera.lat).toFixed(4)}, {Number(cabecera.lng).toFixed(4)}
              </code>
            )}
          </div>
          {cabecera.descripcion && (
            <p className="tac-drawer-desc">{cabecera.descripcion}</p>
          )}
          {cabecera.fotoUrl && (
            <button
              type="button"
              className="tac-drawer-photo-btn"
              onClick={() =>
                onAmpliarFoto?.({
                  src: cabecera.fotoUrl,
                  title: `${cabecera.titulo} — ${cabecera.ubicacion}`,
                })
              }
            >
              <img
                src={cabecera.fotoUrl}
                alt={`Fotografía ${cabecera.titulo}`}
                className="tac-drawer-photo"
              />
              <span>Ampliar fotografía adjunta</span>
            </button>
          )}
        </div>

        {/* 2. Métricas clave en tarjetas (solo personal operativo) */}
        {!modoCiudadano && (
        <section className="tac-drawer-section">
          <h4 className="tac-drawer-sec-title">Métricas clave del foco</h4>
          <div className="tac-metrics-grid">
            <div className="tac-metric-card">
              <span className="tac-metric-label">Hectáreas afectadas</span>
              <strong className="tac-metric-value">
                {metricas.hectareas} ha
              </strong>
              <small className="tac-metric-sub">
                {metricas.hectareasEsEstimado ? 'Perímetro est.' : 'Medición directa'}
              </small>
            </div>

            <div className="tac-metric-card">
              <span className="tac-metric-label">Contención</span>
              <strong className="tac-metric-value">
                {metricas.contencionPct}%
              </strong>
              <div className="tac-progress-track" aria-hidden="true">
                <div
                  className="tac-progress-fill"
                  style={{ width: `${metricas.contencionPct}%` }}
                />
              </div>
            </div>

            <div className="tac-metric-card">
              <span className="tac-metric-label">Temp. / Potencia (FRP)</span>
              <strong className="tac-metric-value">
                {metricas.frpMw} MW
              </strong>
              <small className="tac-metric-sub">
                ~{metricas.temperaturaFocoC} °C foco
              </small>
            </div>
          </div>
        </section>
        )}

        {/* 3. Línea de tiempo / Historial y Fuente */}
        <section className="tac-drawer-section">
          <div className="tac-drawer-sec-head">
            <h4 className="tac-drawer-sec-title">Línea de tiempo e historial</h4>
            <span className="tac-source-chip">{cabecera.fuenteDato}</span>
          </div>

          <ol className="tac-timeline">
            {historial.map((ev, idx) => (
              <li key={`${ev.hora}-${idx}`} className="tac-timeline-item">
                <span className="tac-timeline-dot" aria-hidden="true" />
                <div className="tac-timeline-body">
                  <div className="tac-timeline-top">
                    <strong>{ev.titulo}</strong>
                    <time>{ev.hora}</time>
                  </div>
                  {ev.detalle && <p>{ev.detalle}</p>}
                  <span className="tac-timeline-source">Fuente: {ev.fuente}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Acciones rápidas operativas */}
        <footer className="tac-drawer-actions">
          {cabecera.lat != null && cabecera.lng != null && (
            <button
              type="button"
              className="tac-drawer-btn"
              onClick={() => onEnfocarCoords?.({ lat: cabecera.lat, lng: cabecera.lng })}
            >
              {modoCiudadano ? '📍 Centrar en el mapa' : '🎯 Enfocar perímetro'}
            </button>
          )}

          {!modoCiudadano &&
            foco.kind === 'aviso' &&
            raw.estado_aviso === 'PENDIENTE' &&
            onVerificarAviso && (
              <button
                type="button"
                className="tac-drawer-btn"
                onClick={() => onVerificarAviso(raw.id_aviso)}
                disabled={loading}
              >
                ✓ Verificar aviso
              </button>
            )}

          {!modoCiudadano && foco.kind === 'aviso' && onConvertirAviso && (
            <button
              type="button"
              className="tac-drawer-btn is-primary"
              onClick={() => onConvertirAviso(raw)}
              disabled={loading}
            >
              🔥 Abrir Incidente
            </button>
          )}

          {!modoCiudadano && foco.kind === 'grupo' && onConsolidarGrupo && (
            <button
              type="button"
              className="tac-drawer-btn is-primary"
              onClick={() => onConsolidarGrupo(raw)}
              disabled={loading}
            >
              ⚡ Consolidar {raw.cantidad_avisos} en 1 Incidente
            </button>
          )}

          {!modoCiudadano && foco.kind === 'incidente' && onGestionarIncidente && (
            <button
              type="button"
              className="tac-drawer-btn is-primary"
              onClick={() => onGestionarIncidente(raw.id_incidente)}
              disabled={loading}
            >
              🚒 Gestionar Incidente →
            </button>
          )}

          {!modoCiudadano &&
            foco.kind === 'satelite' &&
            raw.incidente_cercano &&
            onGestionarIncidente && (
              <button
                type="button"
                className="tac-drawer-btn is-primary"
                onClick={() =>
                  onGestionarIncidente(raw.incidente_cercano.id_incidente)
                }
                disabled={loading}
              >
                🚒 Ir a Incidente #{raw.incidente_cercano.id_incidente} →
              </button>
            )}

          {!modoCiudadano &&
            foco.kind === 'satelite' &&
            !raw.incidente_cercano &&
            !raw.aviso_cercano &&
            onCrearAvisoDesdeSatelite && (
              <button
                type="button"
                className="tac-drawer-btn is-primary"
                onClick={() => onCrearAvisoDesdeSatelite(raw)}
                disabled={loading}
              >
                🛰️ Registrar Aviso en Triage
              </button>
            )}
        </footer>
      </div>
    </aside>
  );
}
