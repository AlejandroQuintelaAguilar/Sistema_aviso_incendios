import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Campo from "../../components/common/Campo";
import AppLayout from "../../components/layout/AppLayout";
import * as estacionesService from "../../services/estacionesService";
import * as brigadasService from "../../services/brigadasService";

export default function FrmEditarBrigada() {
  const { idBrigada } = useParams();
  const navigate = useNavigate();
  const [estaciones, setEstaciones] = useState([]);
  const [form, setForm] = useState({ nombre: "", id_estacion: "" });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let activo = true;
    Promise.all([brigadasService.obtener(idBrigada), estacionesService.listar()])
      .then(([brigada, lista]) => {
        if (!activo) return;
        setForm({
          nombre: brigada.nombre,
          id_estacion: String(brigada.id_estacion),
        });
        setEstaciones(lista);
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
  }, [idBrigada]);

  function cambiar(evento) {
    setForm((actual) => ({ ...actual, [evento.target.name]: evento.target.value }));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setError("");
    setGuardando(true);
    try {
      await brigadasService.editar(idBrigada, {
        nombre: form.nombre,
        id_estacion: Number(form.id_estacion),
      });
      navigate("/brigadas", { state: { mensaje: "Brigada actualizada correctamente" } });
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppLayout ancha>
      <section className="cuenta-tarjeta cuenta-tarjeta-ancha">
        <h1>Editar brigada</h1>
        <p className="bajada">
          Actualiza el nombre y la estación de adscripción. El estado se cambia desde el listado
          con su motivo correspondiente.
        </p>
        {error && <p className="aviso">{error}</p>}
        {cargando ? (
          <p className="estado">Cargando brigada.</p>
        ) : (
          <form className="form-acceso" onSubmit={guardar} noValidate>
            <Campo
              id="bg-edit-nombre"
              name="nombre"
              etiqueta="Nombre de la brigada"
              value={form.nombre}
              onChange={cambiar}
              maxLength={100}
              required
            />
            <label className="campo" htmlFor="bg-edit-estacion">
              <span>Estación de adscripción</span>
              <select id="bg-edit-estacion" name="id_estacion" value={form.id_estacion} onChange={cambiar} required>
                {estaciones.map((estacion) => (
                  <option key={estacion.id_estacion} value={estacion.id_estacion}>
                    {estacion.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="acciones-form">
              <button className="boton boton-oscuro" type="submit" disabled={guardando}>
                {guardando ? "Guardando." : "Guardar cambios"}
              </button>
              <Link to="/brigadas">Volver a brigadas</Link>
            </div>
          </form>
        )}
      </section>
    </AppLayout>
  );
}
