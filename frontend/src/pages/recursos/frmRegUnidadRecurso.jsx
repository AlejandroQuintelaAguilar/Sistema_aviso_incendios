import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Campo from "../../components/common/Campo";
import AppLayout from "../../components/layout/AppLayout";
import { useVigia } from "../../context/VigiaContext";
import * as estacionesService from "../../services/estacionesService";

const VACIO = {
  id_estacion: "",
  codigo: "",
  tipo: "",
  capacidad: "",
  nombre: "",
  tipo_recurso: "equipo",
  cantidad: "",
};
const TIPOS_RECURSO = ["equipo", "herramienta", "insumo"];

export default function FrmRegUnidadRecurso() {
  const [searchParams] = useSearchParams();
  const idEstacionParam = searchParams.get("estacion");
  const { cargarEstaciones } = useVigia();
  const [estaciones, setEstaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [categoria, setCategoria] = useState("UNIDAD");
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
        const preferida = lista.find(
          (estacion) => String(estacion.id_estacion) === idEstacionParam
        );
        const elegida = preferida || lista[0];
        if (elegida) {
          setForm((actual) => ({ ...actual, id_estacion: String(elegida.id_estacion) }));
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
  }, [idEstacionParam]);

  function cambiar(event) {
    setForm((actual) => ({ ...actual, [event.target.name]: event.target.value }));
  }

  function elegirCategoria(event) {
    setCategoria(event.target.value);
    setError("");
    setMensaje("");
  }

  async function registrar(event) {
    event.preventDefault();
    setError("");
    setMensaje("");
    const datos = {
      categoria,
      id_estacion: Number(form.id_estacion),
      ...(categoria === "UNIDAD"
        ? {
            codigo: form.codigo,
            tipo: form.tipo,
            capacidad: form.capacidad,
          }
        : {
            nombre: form.nombre,
            tipo_recurso: form.tipo_recurso,
            cantidad: form.cantidad,
          }),
    };
    setGuardando(true);
    try {
      const respuesta = await estacionesService.registrarUnidadRecurso(datos);
      const estacion = estaciones.find(
        (item) => String(item.id_estacion) === String(form.id_estacion)
      );
      setMensaje(
        `${respuesta.mensaje || "Registrado correctamente"} en ${estacion?.nombre || "la estación seleccionada"}.`
      );
      await cargarEstaciones();
      // Se limpia solo el registro nuevo; se conserva la estación y la categoría.
      setForm((actual) => ({
        ...actual,
        codigo: "",
        tipo: "",
        capacidad: "",
        nombre: "",
        cantidad: "",
      }));
    } catch (err) {
      // Ante un error de validación se conservan todos los datos escritos.
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppLayout ancha>
      <section className="cuenta-tarjeta cuenta-tarjeta-ancha">
        <h1>Registrar unidad o recurso</h1>
        <p className="bajada">
          Toda unidad o recurso pertenece a una estación. El administrador y el estado
          inicial (<strong>Disponible</strong>) se asignan automáticamente.
        </p>

        {cargando && <p className="estado">Cargando estaciones…</p>}
        {!cargando && estaciones.length === 0 && (
          <div className="aviso" role="status">
            No hay estaciones registradas. Primero debes{" "}
            <Link to="/recursos/estaciones/nueva">registrar una estación</Link> antes de
            registrar unidades o recursos.
          </div>
        )}

        {!cargando && estaciones.length > 0 && (
          <>
            {error && <p className="aviso">{error}</p>}
            {mensaje && <p className="ok">{mensaje}</p>}
            <form className="form-acceso" onSubmit={registrar} noValidate>
              <label className="campo" htmlFor="reg-categoria">
                <span>Categoría</span>
                <select
                  id="reg-categoria"
                  value={categoria}
                  onChange={elegirCategoria}
                >
                  <option value="UNIDAD">Unidad (vehículo)</option>
                  <option value="RECURSO">Recurso (equipo, herramienta o insumo)</option>
                </select>
              </label>

              <label className="campo" htmlFor="reg-estacion">
                <span>Estación</span>
                <select
                  id="reg-estacion"
                  name="id_estacion"
                  value={form.id_estacion}
                  onChange={cambiar}
                  required
                >
                  {estaciones.map((estacion) => (
                    <option key={estacion.id_estacion} value={estacion.id_estacion}>
                      {estacion.nombre}
                    </option>
                  ))}
                </select>
              </label>

              {categoria === "UNIDAD" ? (
                <>
                  <div className="rejilla">
                    <Campo
                      id="reg-codigo"
                      name="codigo"
                      etiqueta="Código"
                      value={form.codigo}
                      onChange={cambiar}
                      maxLength={50}
                      placeholder="Ej. B-102"
                      required
                    />
                    <Campo
                      id="reg-tipo"
                      name="tipo"
                      etiqueta="Tipo de unidad"
                      value={form.tipo}
                      onChange={cambiar}
                      maxLength={50}
                      placeholder="Ej. Autobomba Pesada"
                      required
                    />
                  </div>
                  <Campo
                    id="reg-capacidad"
                    name="capacidad"
                    etiqueta="Capacidad (número > 0)"
                    type="number"
                    min="1"
                    step="any"
                    value={form.capacidad}
                    onChange={cambiar}
                    required
                  />
                </>
              ) : (
                <>
                  <div className="rejilla">
                    <Campo
                      id="reg-nombre"
                      name="nombre"
                      etiqueta="Nombre del recurso"
                      value={form.nombre}
                      onChange={cambiar}
                      maxLength={100}
                      required
                    />
                    <label className="campo" htmlFor="reg-tipo-recurso">
                      <span>Tipo de recurso</span>
                      <select
                        id="reg-tipo-recurso"
                        name="tipo_recurso"
                        value={form.tipo_recurso}
                        onChange={cambiar}
                      >
                        {TIPOS_RECURSO.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {tipo}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Campo
                    id="reg-cantidad"
                    name="cantidad"
                    etiqueta="Cantidad (entero > 0)"
                    type="number"
                    min="1"
                    step="1"
                    value={form.cantidad}
                    onChange={cambiar}
                    required
                  />
                </>
              )}

              <div className="acciones-form">
                <button className="boton boton-oscuro" type="submit" disabled={guardando}>
                  {guardando ? "Guardando…" : "Registrar"}
                </button>
                <Link to="/recursos">Volver a estaciones</Link>
                <Link to="/recursos/consultar">Consultar infraestructura →</Link>
              </div>
            </form>
          </>
        )}
      </section>
    </AppLayout>
  );
}
