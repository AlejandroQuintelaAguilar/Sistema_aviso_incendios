import { useState } from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';

export function CerrarIncidenteModal({
  abierto,
  incidente,
  informes = [],
  evaluacion = null,
  brigadasActivasCount = 0,
  unidadesEnMisionCount = 0,
  recursosEnUsoCount = 0,
  loading = false,
  onClose,
  onIrAInformes,
  onConfirmarCierre,
}) {
  const [abrirActaAlCerrar, setAbrirActaAlCerrar] = useState(true);

  if (!abierto || !incidente) return null;

  const tieneInforme = informes.length > 0;
  const tieneEvaluacion = Boolean(evaluacion);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Cerrar Incidente #${incidente.id_incidente}`}
      onClick={onClose}
    >
      <div
        className="modal-card inc-close-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>Cerrar Incidente #{incidente.id_incidente}</h2>
            <p className="subtitle">{incidente.ubicacion}</p>
          </div>
          <div className="item-actions">
            <StatusBadge value={incidente.gravedad} />
            <StatusBadge value={incidente.estado} />
          </div>
        </div>

        <div className="inc-close-checklist">
          <div className={`inc-check-row ${tieneInforme ? 'is-ok' : 'is-fail'}`}>
            <span className="inc-check-icon" aria-hidden="true">
              {tieneInforme ? '✓' : '✕'}
            </span>
            <div className="inc-check-body">
              <strong>
                Informe de bombero obligatorio ({informes.length} registrado
                {informes.length === 1 ? '' : 's'})
              </strong>
              <p>
                {tieneInforme
                  ? 'Requisito cumplido. El expediente cuenta con respaldo operativo de campo.'
                  : 'Debe existir al menos un informe de bombero antes de cerrar oficialmente el incidente.'}
              </p>
            </div>
            {!tieneInforme && onIrAInformes && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  onClose();
                  onIrAInformes();
                }}
              >
                Ir a Informes
              </button>
            )}
          </div>

          <div className={`inc-check-row ${tieneEvaluacion ? 'is-ok' : 'is-warn'}`}>
            <span className="inc-check-icon" aria-hidden="true">
              {tieneEvaluacion ? '✓' : '!'}
            </span>
            <div className="inc-check-body">
              <strong>Evaluación de daños</strong>
              <p>
                {tieneEvaluacion
                  ? `Registrada: ${evaluacion.tipo_dano} (${evaluacion.nivel_dano}) — Bs. ${Number(
                      evaluacion.costo_estimado || 0
                    ).toLocaleString()}.`
                  : 'Opcional para cerrar, pero recomendable registrarla ahora porque el expediente quedará en solo lectura.'}
              </p>
            </div>
          </div>
        </div>

        <div className="inc-close-effects">
          <h4>Efectos automáticos al confirmar el cierre</h4>
          <ul>
            <li>
              El incidente pasará a estado <strong>CERRADO</strong> con fecha/hora oficial y bloqueo de edición.
            </li>
            <li>
              Brigadas activas a liberar:{' '}
              <strong>{brigadasActivasCount}</strong>
            </li>
            <li>
              Unidades móviles de estación a retornar a base:{' '}
              <strong>{unidadesEnMisionCount}</strong>
            </li>
            <li>
              Lotes de recursos de estación a liberar:{' '}
              <strong>{recursosEnUsoCount}</strong>
            </li>
          </ul>
        </div>

        <label className="checkbox-row inc-close-acta-opt">
          <input
            type="checkbox"
            checked={abrirActaAlCerrar}
            onChange={(e) => setAbrirActaAlCerrar(e.target.checked)}
          />
          <span>Abrir Acta / Expediente imprimible automáticamente al cerrar</span>
        </label>

        <div className="inc-close-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={loading || !tieneInforme}
            onClick={() => onConfirmarCierre(abrirActaAlCerrar)}
          >
            {loading ? 'Cerrando incidente...' : 'Confirmar Cierre Oficial'}
          </button>
        </div>
      </div>
    </div>
  );
}
