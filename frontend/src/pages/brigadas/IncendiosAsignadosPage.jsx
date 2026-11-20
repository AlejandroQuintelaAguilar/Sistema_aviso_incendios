import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { estadoAsignacion } from "../../components/brigadas/estadosBrigada";
import AppLayout from "../../components/layout/AppLayout";
import Icono from "../../components/layout/IconosVigia";
import { useAuth } from "../../hooks/useAuth";
import * as brigadasService from "../../services/brigadasService";

export default function IncendiosAsignadosPage() {
  const { usuario } = useAuth();
  const esJefe = usuario?.rol === "BOMBERO";

  const [asignaciones, setAsignaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmando, setConfirmando] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setAsignaciones(await brigadasService.incendiosAsignados());
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function confirmar(asignacion) {
    setConfirmando(asignacion);
    setError("");
    setMensaje("");
    try {
      const respuesta = await brigadasService.confirmarRecepcion(
        asignacion.id_incidente,
        asignacion.id_brigada
      );
      setMensaje(`${respuesta.mensaje} · Incidente #${asignacion.id_incidente}`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmando(null);
    }
  }

  return (
    <AppLayout ancha suelta>
      <section className="cuenta-tarjeta cuenta-tarjeta-ancha">
        <h1>Incendios asignados</h1>
        <p className="bajada">
          La asignación la crea el módulo de Incidentes (iteración 5). Desde Brigadas solo se
          consulta y el jefe de cuadrilla confirma la recepción.
        </p>

        {error && <p className="aviso">{error}</p>}
        {mensaje && <p className="ok">{mensaje}</p>}
        {cargando && <p className="estado">Cargando asignaciones.</p>}
        {!cargando && asignaciones.length === 0 && (
          <p className="estado">
            No hay asignaciones para mostrar.{" "}
            <Link to="/brigadas">Volver a brigadas</Link>.
          </p>
        )}

        {!cargando && asignaciones.length > 0 && (
          <div className="bg-asignaciones">
            {asignaciones.map((asignacion) => {
              const estado = estadoAsignacion(asignacion.estado_asignacion);
              return (
                <article className="bg-asignacion" key={`${asignacion.id_incidente}-${asignacion.id_brigada}`}>
                  <div className="bg-asignacion-cabecera">
                    <span className="re-card-icono"><Icono nombre="llama" tamano={22} /></span>
                    <div>
                      <h2>Incidente #{asignacion.id_incidente}</h2>
                      <p>
                        <Icono nombre="ubicacion" tamano={14} /> {asignacion.ubicacion || "Ubicación sin registrar"}
                        {" · "}Gravedad: {asignacion.gravedad || "-"}
                      </p>
                    </div>
                    <span className={`re-estado bg-estado-${estado.clase}`}>
                      <i className="vg-punto" /> {estado.etiqueta}
                    </span>
                  </div>

                  <div className="bg-asignacion-datos">
                    <div><small>Brigada</small><strong>{asignacion.brigada}</strong></div>
                    <div><small>Estado del incidente</small><strong>{asignacion.estado_incidente || "-"}</strong></div>
                    <div><small>Fecha de asignación</small><strong>{asignacion.fecha_asignacion || "-"}</strong></div>
                  </div>

                  {esJefe && asignacion.estado_asignacion === "ASIGNADA" && (
                    <div className="acciones-form">
                      <button
                        className="boton boton-oscuro"
                        type="button"
                        onClick={() => confirmar(asignacion)}
                        disabled={confirmando === asignacion}
                      >
                        <Icono nombre="check" tamano={16} />
                        {confirmando === asignacion ? "Confirmando." : "Confirmar recepción"}
                      </button>
                    </div>
                  )}
                  {esJefe && asignacion.estado_asignacion !== "ASIGNADA" && (
                    <p className="estado">Recepción ya confirmada para esta asignación.</p>
                  )}
                  {!esJefe && (
                    <p className="estado">
                      Solo el jefe de cuadrilla de la brigada puede confirmar la recepción.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AppLayout>
  );
}
