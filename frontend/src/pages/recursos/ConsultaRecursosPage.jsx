import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout";
import ModalCambioEstado, {
  etiquetaEstado,
} from "../../components/recursos/ModalCambioEstado";
import ImagenEstacion from "../../components/recursos/ImagenEstacion";
import * as estacionesService from "../../services/estacionesService";

export default function ConsultaRecursosPage() {
  const { state } = useLocation();
  const [filtro, setFiltro] = useState(
    state?.filtro === "DISPONIBLE" ? "DISPONIBLE" : "TODOS"
  );
  const [estaciones, setEstaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [editor, setEditor] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    estacionesService
      .consultar(filtro === "DISPONIBLE" ? "Disponible" : "")
      .then((lista) => {
        if (activo) setEstaciones(lista);
      })
      .catch((err) => {
        if (activo) setError(err.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [filtro]);

  async function guardarEstado(item, estado, motivo) {
    setError("");
    setMensaje("");
    setGuardando(true);
    try {
      const respuesta = await estacionesService.cambiarEstado(
        item.categoria.toLowerCase(),
        item.id,
        estado,
        motivo
      );
      setMensaje(`${respuesta.mensaje} · ${item.identificador}`);
      setEditor(null);
      setEstaciones(
        await estacionesService.consultar(filtro === "DISPONIBLE" ? "Disponible" : "")
      );
    } catch (err) {
      // El modal sigue abierto y conserva lo escrito para permitir reintentar.
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppLayout ancha suelta>
      <section className="cuenta-tarjeta cuenta-tarjeta-ancha">
        <h1>Consultar recursos y estaciones</h1>
        <p className="bajada">
          Unidades y recursos agrupados por estación. El filtro rápido usa el parámetro
          <code> ?estado=Disponible</code> del endpoint.
        </p>

        {state?.enfocar === "estado" && (
          <p className="ok">
            En el listado, pulsa <strong>Cambiar estado</strong> en la fila que quieras actualizar.
          </p>
        )}

        <div className="filtros">
          <button
            type="button"
            className={`boton ${filtro === "TODOS" ? "boton-oscuro" : ""}`}
            onClick={() => setFiltro("TODOS")}
          >
            Todos
          </button>
          <button
            type="button"
            className={`boton ${filtro === "DISPONIBLE" ? "boton-oscuro" : ""}`}
            onClick={() => setFiltro("DISPONIBLE")}
          >
            Solo disponibles
          </button>
        </div>

        {error && <p className="aviso">{error}</p>}
        {mensaje && <p className="ok">{mensaje}</p>}
        {cargando && <p className="estado">Cargando infraestructura…</p>}
        {!cargando && estaciones.length === 0 && (
          <p className="estado">
            Todavía no hay estaciones registradas.{" "}
            <Link to="/recursos/estaciones/nueva">Registrar la primera estación</Link>.
          </p>
        )}

        {!cargando &&
          estaciones.map((estacion) => {
            const registros = [...estacion.unidades, ...estacion.recursos];
            return (
              <article className="recurso-estacion" key={estacion.id_estacion}>
                <div className="recurso-estacion-cabecera">
                  <ImagenEstacion
                    estacion={estacion}
                    className="recurso-estacion-foto"
                    loading="lazy"
                  />
                  <div>
                    <h2>{estacion.nombre}</h2>
                    <p className="bajada">
                      {estacion.direccion} · Teléfono: {estacion.telefono || "—"}
                    </p>
                  </div>
                </div>
                <div className="tabla-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Categoría</th>
                        <th>Código / Nombre</th>
                        <th>Tipo</th>
                        <th>Capacidad / Cantidad</th>
                        <th>Estado</th>
                        <th>Motivo</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {registros.length === 0 && (
                        <tr>
                          <td className="tabla-vacia" colSpan={7}>
                            {filtro === "DISPONIBLE"
                              ? "No hay registros disponibles en esta estación."
                              : "Esta estación todavía no tiene unidades ni recursos."}
                          </td>
                        </tr>
                      )}
                      {registros.map((item) => (
                        <tr key={`${item.categoria}-${item.id}`}>
                          <td data-etiqueta="Categoría">{item.categoria}</td>
                          <td data-etiqueta="Identificador">{item.identificador}</td>
                          <td data-etiqueta="Tipo">{item.tipo}</td>
                          <td data-etiqueta="Capacidad / Cantidad">
                            {item.capacidad ?? item.cantidad}
                          </td>
                          <td data-etiqueta="Estado">{etiquetaEstado(item.estado)}</td>
                          <td data-etiqueta="Motivo">{item.motivo_estado || "—"}</td>
                          <td>
                            <button
                              type="button"
                              className="boton boton-oscuro"
                              onClick={() => setEditor(item)}
                            >
                              Cambiar estado
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
      </section>

      {editor && (
        <ModalCambioEstado
          item={editor}
          guardando={guardando}
          onCancelar={() => setEditor(null)}
          onGuardar={guardarEstado}
        />
      )}
    </AppLayout>
  );
}
