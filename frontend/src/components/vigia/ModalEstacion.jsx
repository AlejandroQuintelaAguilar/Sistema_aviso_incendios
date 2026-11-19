import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ModalMarco from "./ModalMarco";
import Icono from "../layout/IconosVigia";
import { estadoRecurso, estadoUnidad, iconoRecurso } from "../recursos/estadosRecursos";
import ImagenEstacion from "../recursos/ImagenEstacion";
import { useVigia } from "../../context/VigiaContext";
import { useAuth } from "../../hooks/useAuth";

function idDe(registro) {
  return registro.id_unidad ?? registro.id_recurso ?? registro.id;
}

// Referencias de demostración para la asignación desde la estación.
const INCIDENTES_ACTIVOS = [
  { id: "INC-1042", titulo: "Foco activo Sector Norte" },
  { id: "INC-1041", titulo: "Alerta preventiva Valle Sur" },
  { id: "INC-1038", titulo: "Incendio en interfaz urbana" },
];

export default function ModalEstacion() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMINISTRADOR";
  const {
    estacionSeleccionada,
    cerrarEstacion,
    cambiarEstadoUnidad,
    ajustarRecurso,
    asignarIncidente,
  } = useVigia();
  const [idIncidente, setIdIncidente] = useState("");
  const [avisoAsignacion, setAvisoAsignacion] = useState(null);

  if (!estacionSeleccionada) return null;

  const estacion = estacionSeleccionada;
  const activos = INCIDENTES_ACTIVOS;
  const tieneDotacion =
    estacion.unidades.length > 0 ||
    estacion.recursos.some((recurso) => Number(recurso.cantidad) > 0);

  function despachar(unidad) {
    const destino = unidad.estado === "DISPONIBLE" ? "EN_MISION" : "DISPONIBLE";
    cambiarEstadoUnidad(estacion.id_estacion, idDe(unidad), destino);
  }

  function asignar() {
    setAvisoAsignacion(null);
    if (!idIncidente) {
      setAvisoAsignacion({
        tipo: "error",
        texto: "Selecciona un incidente activo antes de asignar la estación.",
      });
      return;
    }

    const resultado = asignarIncidente(estacion.id_estacion, idIncidente);
    if (!resultado?.ok) {
      setAvisoAsignacion({
        tipo: "error",
        texto: resultado?.mensaje || "No se pudo asignar la estación.",
      });
      return;
    }

    const incidente = activos.find((aviso) => aviso.id === idIncidente);
    setAvisoAsignacion({
      tipo: "ok",
      texto: `Estación asignada a ${incidente?.titulo || idIncidente}.`,
    });
  }

  return (
    <ModalMarco
      onCerrar={cerrarEstacion}
      className="vg-modal-estacion"
      etiqueta={`Gestión de ${estacion.nombre}`}
    >
      <div className="me-foto">
        <ImagenEstacion estacion={estacion} />
        <span className="me-foto-etiqueta">Vista de la estación</span>
      </div>
      <div className="me-cabecera">
        <span className="me-cabecera-icono"><Icono nombre="estacion" tamano={26} /></span>
        <div>
          <span className="me-etiqueta">Gestión de estación</span>
          <h2>{estacion.nombre}</h2>
          <p><Icono nombre="ubicacion" tamano={14} /> {estacion.direccion || "Ubicación sin registrar"}</p>
        </div>
      </div>

      <div className="me-cuerpo">
        {esAdmin && (
          <div className="me-acciones-admin">
            <button
              type="button"
              className="vg-boton-secundario"
              onClick={() => {
                cerrarEstacion();
                navigate(`/recursos/unidades/nueva?estacion=${estacion.id_estacion}`);
              }}
            >
              <Icono nombre="mas" tamano={16} /> Agregar unidad o recurso a esta estación
            </button>
          </div>
        )}

        <section className="me-seccion">
          <div className="me-seccion-titulo">
            <h3><Icono nombre="automovil" tamano={17} /> Unidades</h3>
            <span>{estacion.unidades.length} registradas</span>
          </div>
          {estacion.unidades.length > 0 ? (
            <ul className="me-listado">
              {estacion.unidades.map((unidad) => {
                const estado = estadoUnidad(unidad.estado);
                const enBase = unidad.estado === "DISPONIBLE";
                return (
                  <li className="me-fila" key={idDe(unidad)}>
                    <span className="me-fila-icono"><Icono nombre="automovil" tamano={20} /></span>
                    <span className="me-fila-datos">
                      <strong>Unidad Móvil {unidad.codigo || "—"}</strong>
                      <small>{unidad.tipo || "Vehículo"} · Placa/código {unidad.codigo || "—"}</small>
                    </span>
                    <span className={`re-estado ${estado.clase}`}>
                      <i className="vg-punto" /> {estado.etiqueta}
                    </span>
                    <button
                      type="button"
                      className="me-boton-accion"
                      onClick={() => despachar(unidad)}
                    >
                      {enBase ? "Despachar" : "Regresar a base"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="re-vacio-seccion">Esta estación no tiene unidades registradas.</p>
          )}
        </section>

        <section className="me-seccion">
          <div className="me-seccion-titulo">
            <h3><Icono nombre="capas" tamano={17} /> Recursos disponibles</h3>
            <span>Ajusta el inventario</span>
          </div>
          {estacion.recursos.length > 0 ? (
            <ul className="me-listado">
              {estacion.recursos.map((recurso) => {
                const estado = estadoRecurso(recurso.estado);
                return (
                  <li className="me-fila" key={idDe(recurso)}>
                    <span className="me-fila-icono">
                      <Icono nombre={iconoRecurso(recurso.tipo_recurso)} tamano={20} />
                    </span>
                    <span className="me-fila-datos">
                      <strong>{recurso.nombre}</strong>
                      <small>{estado.etiqueta}{recurso.tipo_recurso ? ` · ${recurso.tipo_recurso}` : ""}</small>
                    </span>
                    <div className="me-contador">
                      <button
                        type="button"
                        onClick={() => ajustarRecurso(estacion.id_estacion, idDe(recurso), -1)}
                        aria-label={`Reducir ${recurso.nombre}`}
                      >
                        <Icono nombre="menos" tamano={15} />
                      </button>
                      <strong>{recurso.cantidad}</strong>
                      <button
                        type="button"
                        onClick={() => ajustarRecurso(estacion.id_estacion, idDe(recurso), 1)}
                        aria-label={`Aumentar ${recurso.nombre}`}
                      >
                        <Icono nombre="mas" tamano={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="re-vacio-seccion">Esta estación no tiene recursos registrados.</p>
          )}
        </section>

        <section className="me-seccion">
          <div className="me-seccion-titulo">
            <h3><Icono nombre="incidente" tamano={17} /> Asignar a un incidente</h3>
            <span>{activos.length} activos</span>
          </div>
          <div className="me-asignar">
            <label className="vg-campo">
              <span>Incidente activo</span>
              <select value={idIncidente} onChange={(evento) => setIdIncidente(evento.target.value)}>
                <option value="">Selecciona un incidente…</option>
                {activos.map((aviso) => (
                  <option key={aviso.id} value={aviso.id}>
                    {aviso.id} · {aviso.titulo}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="vg-boton-principal"
              onClick={asignar}
              disabled={!tieneDotacion}
              title={tieneDotacion ? undefined : "Registra una unidad o un recurso antes de asignar"}
            >
              <Icono nombre="check" tamano={16} /> Asignar estación
            </button>
          </div>
          {!tieneDotacion && (
            <p className="me-aviso-asignacion">
              <Icono nombre="alerta" tamano={15} />
              Esta estación no tiene unidades ni recursos con existencia. Registra al menos uno
              antes de asignarla a un incidente.
            </p>
          )}
          {avisoAsignacion && (
            <p
              className={`me-confirmacion${
                avisoAsignacion.tipo === "error" ? " me-confirmacion-error" : ""
              }`}
            >
              <Icono nombre={avisoAsignacion.tipo === "error" ? "alerta" : "check"} tamano={15} />
              {avisoAsignacion.texto}
            </p>
          )}
          {estacion.incidenteAsignado && (
            <p className="me-asignado">
              Asignada actualmente a: <strong>{estacion.incidenteAsignado}</strong>
            </p>
          )}
        </section>

        <p className="me-aviso-local">
          <Icono nombre="alerta" tamano={15} />
          Los cambios de este modal son locales para la demostración y no se guardan en la base de datos.
        </p>
      </div>
    </ModalMarco>
  );
}
