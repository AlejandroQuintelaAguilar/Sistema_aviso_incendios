import { StatusBadge } from '../../components/common/StatusBadge';

export function ExpedienteModal({ expediente, estaciones = [], onClose }) {
  if (!expediente) return null;

  const {
    incidente,
    aviso_origen: aviso,
    zona,
    operador,
    brigadas,
    informes,
    evaluacion_danos: evaluacion,
    timeline,
  } = expediente;

  const marcaIncidente = `Incidente #${incidente.id_incidente}`;
  const unidadesMovilizadas = [];
  const recursosMovilizados = [];
  estaciones.forEach((est) => {
    (est.unidades || []).forEach((u) => {
      if (String(u.motivo_estado || '').includes(marcaIncidente)) {
        unidadesMovilizadas.push({ ...u, nombre_estacion: est.nombre });
      }
    });
    (est.recursos || []).forEach((r) => {
      if (String(r.motivo_estado || '').includes(marcaIncidente)) {
        recursosMovilizados.push({ ...r, nombre_estacion: est.nombre });
      }
    });
  });

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card printable-dossier">
        <div className="modal-header no-print">
          <div>
            <h2>Expediente Oficial — Incidente #{incidente.id_incidente}</h2>
            <p className="subtitle">
              Acta operativa, trazabilidad cronológica y evidencias de campo
            </p>
          </div>
          <div className="item-actions">
            <button type="button" onClick={() => window.print()}>
              Imprimir / Exportar PDF
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cerrar vista
            </button>
          </div>
        </div>

        <div className="print-only-header">
          <h1>ACTA OFICIAL DE INCIDENTE FORESTAL #{incidente.id_incidente}</h1>
          <p>Emitido: {new Date().toLocaleString()}</p>
        </div>

        <div className="dossier-section">
          <h3>1. Resumen General</h3>
          <div className="dossier-grid">
            <div>
              <strong>Ubicación:</strong> {incidente.ubicacion}
            </div>
            <div>
              <strong>Estado:</strong> <StatusBadge value={incidente.estado} />
            </div>
            <div>
              <strong>Gravedad:</strong> <StatusBadge value={incidente.gravedad} />
            </div>
            <div>
              <strong>Zona de Riesgo:</strong>{' '}
              {zona ? `${zona.nombre} (${zona.nivel_riesgo})` : 'Sin zona'}
            </div>
            <div>
              <strong>Operador a Cargo:</strong>{' '}
              {operador ? operador.nombre_completo : 'No asignado'}
            </div>
            <div>
              <strong>Duración Operativa:</strong>{' '}
              {incidente.duracion_min != null
                ? `${incidente.duracion_min} min`
                : 'N/A'}
            </div>
          </div>
        </div>

        {aviso && (
          <div className="dossier-section">
            <h3>2. Aviso Ciudadano de Origen (#{aviso.id_aviso})</h3>
            <p>
              <strong>Urgencia:</strong> {aviso.nivel_urgencia} ·{' '}
              <strong>Descripción:</strong> {aviso.descripcion || 'Sin descripción'}
            </p>
            {aviso.foto && (
              <div className="evidence-box">
                <span>
                  Foto adjunta:{' '}
                  {aviso.foto.startsWith('data:image/')
                    ? 'Imagen capturada desde cámara'
                    : aviso.foto}
                </span>
                {/^(https?:\/\/|data:image\/)/i.test(aviso.foto) && (
                  <img
                    src={aviso.foto}
                    alt="Evidencia del aviso"
                    className="evidence-preview"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className="dossier-section">
          <h3>3. Brigadas, Unidades y Recursos Desplegados</h3>
          {brigadas.length === 0 &&
          unidadesMovilizadas.length === 0 &&
          recursosMovilizados.length === 0 ? (
            <p className="empty-text">No se despacharon brigadas, unidades ni recursos.</p>
          ) : (
            <ul className="dossier-list">
              {brigadas.map((b) => (
                <li key={`${b.id_brigada}-${b.fecha_asignacion}`}>
                  <strong>[Brigada] {b.nombre_brigada}</strong>
                  {b.estacion_nombre ? ` (${b.estacion_nombre})` : ''} — {b.estado_asignacion} (
                  {new Date(b.fecha_asignacion).toLocaleString()})
                  {(b.jefe_cuadrilla || b.cantidad_miembros != null) && (
                    <span className="dossier-sub">
                      {b.jefe_cuadrilla ? ` · Jefe: ${b.jefe_cuadrilla}` : ''}
                      {b.cantidad_miembros != null
                        ? ` · ${b.cantidad_miembros} integrante(s)`
                        : ''}
                    </span>
                  )}
                </li>
              ))}
              {unidadesMovilizadas.map((u) => (
                <li key={`u-${u.id_unidad ?? u.id}`}>
                  <strong>
                    [Unidad {u.codigo}] {u.tipo}
                  </strong>{' '}
                  ({u.nombre_estacion}) — {u.estado}
                  {u.capacidad ? ` · Cap. ${u.capacidad}` : ''}
                </li>
              ))}
              {recursosMovilizados.map((r) => (
                <li key={`r-${r.id_recurso ?? r.id}`}>
                  <strong>[Recurso] {r.nombre}</strong> ({r.nombre_estacion}) — {r.cantidad} u. ·{' '}
                  {r.estado}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dossier-section">
          <h3>4. Informes de Campo ({informes.length})</h3>
          {informes.length === 0 ? (
            <p className="empty-text">Sin informes registrados.</p>
          ) : (
            <ul className="dossier-list">
              {informes.map((inf) => {
                const esImg =
                  typeof inf.evidencia === 'string' &&
                  /^(https?:\/\/|data:image\/)/i.test(inf.evidencia.trim());
                return (
                  <li key={inf.id_informe}>
                    <strong>{inf.nombre_bombero}</strong> (
                    {new Date(inf.fecha_hora).toLocaleString()}): {inf.acciones}
                    {inf.observaciones && ` · Obs: ${inf.observaciones}`}
                    {inf.evidencia && !esImg && ` · Evidencia: ${inf.evidencia}`}
                    {esImg && (
                      <div className="evidence-box">
                        <img
                          src={inf.evidencia.trim()}
                          alt={`Evidencia informe #${inf.id_informe}`}
                          className="evidence-preview"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="dossier-section">
          <h3>5. Evaluación de Daños</h3>
          {evaluacion ? (
            <p>
              <strong>Tipo:</strong> {evaluacion.tipo_dano} ·{' '}
              <strong>Nivel:</strong> {evaluacion.nivel_dano} ·{' '}
              <strong>Costo estimado:</strong> Bs.{' '}
              {Number(evaluacion.costo_estimado || 0).toLocaleString()}
              {evaluacion.descripcion && ` · ${evaluacion.descripcion}`}
            </p>
          ) : (
            <p className="empty-text">Sin evaluación de daños registrada.</p>
          )}
        </div>

        <div className="dossier-section">
          <h3>6. Línea de Tiempo Operativa (Timeline)</h3>
          <ol className="timeline-list">
            {timeline.map((ev, idx) => (
              <li key={`${ev.tipo}-${idx}`} className="timeline-item">
                <div className="timeline-time">
                  {new Date(ev.timestamp).toLocaleString()}
                </div>
                <div className="timeline-body">
                  <strong>{ev.titulo}</strong>
                  <p>{ev.detalle}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
