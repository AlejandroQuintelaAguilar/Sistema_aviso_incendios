import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ESTADOS_BRIGADA, requiereMotivo } from "../../components/brigadas/estadosBrigada";
import Campo from "../../components/common/Campo";
import AppLayout from "../../components/layout/AppLayout";
import * as estacionesService from "../../services/estacionesService";
import * as brigadasService from "../../services/brigadasService";

const VACIO = { nombre: "", id_estacion: "", estado: "ACTIVA", motivo: "" };
const OPCIONES_ALTA = ESTADOS_BRIGADA.filter(([codigo]) => codigo !== "DISUELTA");

export default function FrmRegBrigada() {
  const [estaciones, setEstaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let activo = true;
    estacionesService
      .listar()
      .then((lista) => {
        if (!activo) return;
        setEstaciones(lista);
        if (lista.length) {
          setForm((actual) => ({ ...actual, id_estacion: String(lista[0].id_estacion) }));
        }
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
  }, []);

  function cambiar(evento) {
    setForm((actual) => ({ ...actual, [evento.target.name]: evento.target.value }));
  }

  async function registrar(evento) {
    evento.preventDefault();
    setError("");
    setMensaje("");
    setGuardando(true);
    try {
      const respuesta = await brigadasService.crear({
        nombre: form.nombre,
        id_estacion: Number(form.id_estacion),
        estado: form.estado,
        motivo: form.motivo,
      });
      setMensaje(`${respuesta.mensaje} · ${respuesta.brigada.nombre}`);
      setForm({ ...VACIO, id_estacion: String(estaciones[0]?.id_estacion || "") });
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppLayout ancha>
      <section className="cuenta-tarjeta cuenta-tarjeta-ancha">
        <h1>Registrar brigada</h1>
        <p className="bajada">
          Toda brigada pertenece a una estación. El estado inicial es <strong>Activa</strong> y la
          disponibilidad se calcula automáticamente a partir del estado y de sus asignaciones.
        </p>

        {cargando && <p className="estado">Cargando estaciones.</p>}
        {!cargando && estaciones.length === 0 && (
          <div className="aviso" role="status">
            No hay estaciones registradas. Primero debes{" "}
            <Link to="/recursos/estaciones/nueva">registrar una estación</Link> antes de crear una
            brigada.
          </div>
        )}
        {error && <p className="aviso">{error}</p>}
        {mensaje && <p className="ok">{mensaje}</p>}

        {!cargando && estaciones.length > 0 && (
          <form className="form-acceso" onSubmit={registrar} noValidate>
            <Campo
              id="bg-nombre"
              name="nombre"
              etiqueta="Nombre de la brigada"
              value={form.nombre}
              onChange={cambiar}
              maxLength={100}
              placeholder="Ej. Brigada Lince - Ataque Rápido"
              required
            />

            <label className="campo" htmlFor="bg-estacion">
              <span>Estación de adscripción</span>
              <select id="bg-estacion" name="id_estacion" value={form.id_estacion} onChange={cambiar} required>
                {estaciones.map((estacion) => (
                  <option key={estacion.id_estacion} value={estacion.id_estacion}>
                    {estacion.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="campo" htmlFor="bg-estado">
              <span>Estado inicial</span>
              <select id="bg-estado" name="estado" value={form.estado} onChange={cambiar}>
                {OPCIONES_ALTA.map(([codigo, etiqueta]) => (
                  <option key={codigo} value={codigo}>{etiqueta}</option>
                ))}
              </select>
            </label>

            {requiereMotivo(form.estado) && (
              <label className="campo" htmlFor="bg-motivo">
                <span>Motivo del estado (obligatorio)</span>
                <textarea
                  id="bg-motivo"
                  name="motivo"
                  value={form.motivo}
                  onChange={cambiar}
                  maxLength={500}
                  rows={3}
                  required
                />
              </label>
            )}

            <div className="acciones-form">
              <button className="boton boton-oscuro" type="submit" disabled={guardando}>
                {guardando ? "Guardando." : "Registrar brigada"}
              </button>
              <Link to="/brigadas">Volver a brigadas</Link>
              <Link to="/brigadas/consultar">Consultar brigadas</Link>
            </div>
          </form>
        )}
      </section>
    </AppLayout>
  );
}
