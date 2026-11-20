import { useState } from "react";
import {
  ESTADOS_BRIGADA,
  etiquetaEstadoBrigada,
  requiereMotivo,
} from "./estadosBrigada";

export default function ModalCambioEstadoBrigada({
  item,
  onCancelar,
  onGuardar,
  guardando,
}) {
  const [estado, setEstado] = useState(item.estado);
  const [motivo, setMotivo] = useState(item.motivo_estado || "");

  return (
    <div className="modal-fondo">
      <div
        className="cuenta-tarjeta modal-caja"
        role="dialog"
        aria-modal="true"
        aria-label="Cambiar estado de la brigada"
      >
        <h2>Cambiar estado de la brigada</h2>
        <p className="bajada">{item.nombre}</p>
        <form
          className="form-acceso"
          onSubmit={(evento) => {
            evento.preventDefault();
            onGuardar(item, estado, motivo);
          }}
        >
          <label className="campo" htmlFor="brigada-estado">
            <span>Nuevo estado</span>
            <select
              id="brigada-estado"
              value={estado}
              onChange={(evento) => setEstado(evento.target.value)}
            >
              {ESTADOS_BRIGADA.map(([codigo, etiqueta]) => (
                <option key={codigo} value={codigo}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </label>

          {requiereMotivo(estado) && (
            <label className="campo" htmlFor="brigada-motivo">
              <span>Motivo del cambio (obligatorio)</span>
              <textarea
                id="brigada-motivo"
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Explica por qué se cambia el estado"
                required
              />
            </label>
          )}

          <div className="acciones-form">
            <button className="boton boton-oscuro" type="submit" disabled={guardando}>
              {guardando ? "Guardando." : "Guardar estado"}
            </button>
            <button className="boton" type="button" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </button>
          </div>
        </form>
        <p className="estado">
          Estado actual: {etiquetaEstadoBrigada(item.estado)}. La disponibilidad se calcula
          automáticamente y no se guarda en una columna.
        </p>
      </div>
    </div>
  );
}
