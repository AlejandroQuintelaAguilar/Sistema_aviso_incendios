import { useEffect, useState } from 'react';
import { StatusBadge } from '../../components/common/StatusBadge';

const MOTIVOS_DESCARTE = [
  'Quema agrícola controlada',
  'Reporte duplicado de otro evento',
  'Sin foco ni humo confirmado en verificación',
  'Falsa alarma / broma',
];

export function DescartarAvisoModal({
  aviso,
  loading = false,
  onClose,
  onConfirmarDescarte,
}) {
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    setMotivo('');
  }, [aviso?.id_aviso]);

  if (!aviso) return null;

  function handleSubmit(e) {
    e.preventDefault();
    onConfirmarDescarte(aviso.id_aviso, motivo.trim() || null);
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Descartar Aviso #${aviso.id_aviso}`}
      onClick={onClose}
    >
      <div
        className="modal-card inc-close-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>Descartar Aviso #{aviso.id_aviso}</h2>
            <p className="subtitle">{aviso.ubicacion}</p>
          </div>
          <div className="item-actions">
            <StatusBadge value={aviso.nivel_urgencia} />
            <StatusBadge value={aviso.estado_aviso} />
          </div>
        </div>

        {aviso.descripcion && (
          <p className="inc-evidence-desc">
            <strong>Descripción reportada:</strong> {aviso.descripcion}
          </p>
        )}

        <form className="form-stack" onSubmit={handleSubmit}>
          <div>
            <span className="inc-field-label">Motivo rápido de descarte (opcional)</span>
            <div className="obs-chips" role="group" aria-label="Motivos rápidos de descarte">
              {MOTIVOS_DESCARTE.map((m) => {
                const seleccionado = motivo === m;
                return (
                  <button
                    key={m}
                    type="button"
                    className={`obs-chip ${seleccionado ? 'selected' : ''}`}
                    onClick={() => setMotivo(seleccionado ? '' : m)}
                    disabled={loading}
                  >
                    {seleccionado ? `✓ ${m}` : `+ ${m}`}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="inc-field-group">
            <span className="inc-field-label">Detalle para auditoría</span>
            <input
              type="text"
              placeholder="Ej. Quema agrícola autorizada o sin columna de humo..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
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
              type="submit"
              className="btn-danger"
              disabled={loading}
            >
              {loading ? 'Descartando...' : 'Confirmar Falso Aviso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
