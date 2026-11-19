import Icono from "../layout/IconosVigia";

export default function ModalMarco({ onCerrar, children, className = "", etiqueta = "Ventana" }) {
  return (
    <div
      className="vg-modal-fondo"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onCerrar();
      }}
    >
      <div className={`vg-modal ${className}`} role="dialog" aria-modal="true" aria-label={etiqueta}>
        <button
          type="button"
          className="vg-modal-cerrar"
          onClick={onCerrar}
          aria-label="Volver y cerrar"
          title="Volver (Esc)"
        >
          <Icono nombre="flechaIzquierda" tamano={19} />
        </button>
        {children}
      </div>
    </div>
  );
}
