import { useState } from "react";

// Códigos exactos de los CHECK de la base de datos, con etiqueta legible.
export const OPCIONES_ESTADO = {
  UNIDAD: [
    ["DISPONIBLE", "Disponible"],
    ["EN_MISION", "En servicio"],
    ["MANTENIMIENTO", "En mantenimiento"],
    ["FUERA_DE_SERVICIO", "Fuera de servicio"],
  ],
  RECURSO: [
    ["DISPONIBLE", "Disponible"],
    ["EN_USO", "En uso"],
    ["AGOTADO", "Agotado"],
    ["DANADO", "Dañado"],
    ["MANTENIMIENTO", "En mantenimiento"],
    ["DE_BAJA", "De baja"],
  ],
};

const CON_MOTIVO = new Set([
  "MANTENIMIENTO",
  "FUERA_DE_SERVICIO",
  "DE_BAJA",
  "DANADO",
]);

export function requiereMotivo(estado) {
  return CON_MOTIVO.has(estado);
}

export function etiquetaEstado(estado) {
  for (const opciones of Object.values(OPCIONES_ESTADO)) {
    const encontrada = opciones.find(([codigo]) => codigo === estado);
    if (encontrada) return encontrada[1];
  }
  return estado;
}

export default function ModalCambioEstado({ item, onCancelar, onGuardar, guardando }) {
  const [estado, setEstado] = useState(item.estado);
  const [motivo, setMotivo] = useState(item.motivo_estado || "");
  const opciones = OPCIONES_ESTADO[item.categoria] || [];

  return (
    <div className="modal-fondo">
      <div className="cuenta-tarjeta modal-caja" role="dialog" aria-modal="true" aria-label="Cambiar estado">
        <h2>Cambiar estado</h2>
        <p className="bajada">
          {item.categoria === "UNIDAD" ? "Unidad" : "Recurso"} {item.identificador} · {item.estacion}
        </p>
        <form
          className="form-acceso"
          onSubmit={(event) => {
            event.preventDefault();
            onGuardar(item, estado, motivo);
          }}
        >
          <label className="campo" htmlFor="cambio-estado">
            <span>Nuevo estado</span>
            <select id="cambio-estado" value={estado} onChange={(event) => setEstado(event.target.value)}>
              {opciones.map(([codigo, etiqueta]) => (
                <option key={codigo} value={codigo}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </label>

          {requiereMotivo(estado) && (
            <label className="campo" htmlFor="cambio-motivo">
              <span>Motivo del cambio (obligatorio)</span>
              <textarea
                id="cambio-motivo"
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Explica por qué se cambia el estado"
                required
              />
            </label>
          )}

          <div className="acciones-form">
            <button className="boton boton-oscuro" type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar estado"}
            </button>
            <button className="boton" type="button" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
