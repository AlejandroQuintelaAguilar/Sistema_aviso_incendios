
import { useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import { useAuth } from "../../hooks/useAuth";
import {
  listarZonas,
  modificarZona,
  eliminarZona,
  cambiarEstadoZona,
  consultarHistorialZona,
  crearZona,
  crearSolicitudZona,
  listarSolicitudesMias,
  listarSolicitudesPendientes,
  evaluarSolicitud,
  registrarInspeccion,
  listarInspecciones,
  emitirAlertaZona,
  resolverUbicacion,
} from "../../services/zonasService";
import "./ZonasRiesgoPage.css";

const FORMULARIO_VACIO = {
  nombre: "",
  ubicacion: "",
  descripcion: "",
  tipo_vegetacion: "",
};

export default function ZonasRiesgoPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMINISTRADOR";

  const [zonas, setZonas] = useState([]);
  const [zonaEnMapa, setZonaEnMapa] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [vistaActiva, setVistaActiva] = useState("catalogo");

  const [zonaEditando, setZonaEditando] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);

  const [zonaEstado, setZonaEstado] = useState(null);
  const [motivo, setMotivo] = useState("");

  const [zonaHistorial, setZonaHistorial] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const esCiudadano = usuario?.rol === "CIUDADANO";
  const esBombero = usuario?.rol === "BOMBERO";
  const [solicitudes, setSolicitudes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [inspecciones, setInspecciones] = useState([]);
  const [solicitudActiva, setSolicitudActiva] = useState(null);
  const [notaEvaluacion, setNotaEvaluacion] = useState("");
  const [zonaInspeccion, setZonaInspeccion] = useState("");
  const [formSolicitud, setFormSolicitud] = useState({ nombre: "", ubicacion: "", descripcion: "", latitud: "", longitud: "", nivel_riesgo_sugerido: "MEDIO" });
  const [formInspeccion, setFormInspeccion] = useState({ nivel_riesgo_observado: "MEDIO", observaciones: "", recomendaciones: "" });
  const [formZonaNueva, setFormZonaNueva] = useState({ nombre: "", ubicacion: "", descripcion: "", nivel_riesgo: "MEDIO", latitud: "", longitud: "", coordenadas: "" });
  const [zonaAlerta, setZonaAlerta] = useState(null);
  const [mensajeAlerta, setMensajeAlerta] = useState("");

  async function cargarZonas() {
    try {
      setCargando(true);
      setError("");
      const respuesta = await listarZonas();
      setZonas(respuesta.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarZonas();
  }, []);

  useEffect(() => {
    if (esCiudadano) listarSolicitudesMias().then((r) => setSolicitudes(r.data || [])).catch((e) => setError(e.message));
    if (esAdmin) listarSolicitudesPendientes().then((r) => setPendientes(r.data || [])).catch((e) => setError(e.message));
  }, [esCiudadano, esAdmin]);

  function limpiarAvisos() {
    setError("");
    setMensaje("");
  }

  function capturarUbicacion(setFormulario) {
    limpiarAvisos();
    if (!navigator.geolocation) {
      setError("Este navegador no permite obtener la ubicación GPS.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFormulario((actual) => ({ ...actual, latitud: String(coords.latitude), longitud: String(coords.longitude) }));
        setMensaje("Ubicación GPS capturada desde este dispositivo.");
      },
      () => setError("No se pudo obtener la ubicación. Permite el acceso en el navegador o escribe las coordenadas manualmente."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  async function resolverUbicacionFormulario(setFormulario, formulario) {
    limpiarAvisos();
    if (!formulario.ubicacion.trim()) {
      setError("Primero pega un enlace de Google Maps o unas coordenadas en el campo Ubicación.");
      return;
    }
    try {
      setProcesando(true);
      const respuesta = await resolverUbicacion(formulario.ubicacion);
      setFormulario((actual) => ({ ...actual, latitud: String(respuesta.data.lat), longitud: String(respuesta.data.lng) }));
      setMensaje("Coordenadas obtenidas desde la ubicación indicada.");
    } catch (err) {
      setError(err.message || "No pude obtener GPS de ese enlace. Prueba con un enlace compartido de Google Maps o usa tu ubicación actual.");
    } finally {
      setProcesando(false);
    }
  }

  function abrirEdicion(zona) {
    limpiarAvisos();
    setVistaActiva("modificar");
    setZonaEditando(zona);
    setFormulario({
      nombre: zona.nombre || "",
      ubicacion: zona.ubicacion || "",
      descripcion: zona.descripcion || "",
      tipo_vegetacion: zona.tipo_vegetacion || "",
      nivel_riesgo: zona.nivel_riesgo || "MEDIO",
      coordenadas: JSON.stringify(zona.coordenadas || [], null, 2),
    });
  }

  async function guardarEdicion(evento) {
    evento.preventDefault();
    if (!zonaEditando) return;

    try {
      setProcesando(true);
      limpiarAvisos();

      let coordenadas;
      try { coordenadas = JSON.parse(formulario.coordenadas || "[]"); }
      catch { setError("Las coordenadas deben ser una lista JSON válida."); setProcesando(false); return; }
      if (!Array.isArray(coordenadas) || !coordenadas.length || coordenadas.some((p) => !p || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) || (coordenadas.length > 1 && coordenadas.length < 3)) {
        setError("Indica un punto GPS o un polígono de al menos tres puntos válidos."); setProcesando(false); return;
      }

      await modificarZona(zonaEditando.id_zona, { ...formulario, coordenadas: coordenadas.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })) });

      setZonaEditando(null);
      setVistaActiva("catalogo");
      setMensaje("Zona modificada correctamente.");
      await cargarZonas();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function borrarZona(zona) {
    if (!esAdmin || !window.confirm(`¿Eliminar la zona “${zona.nombre}”? Se eliminarán su historial, inspecciones, alertas y focos vinculados. Los incidentes y solicitudes aprobadas se conservarán sin asociación a esta zona. Esta acción no se puede deshacer.`)) return;
    try {
      setProcesando(true);
      limpiarAvisos();
      await eliminarZona(zona.id_zona);
      setMensaje(`Zona “${zona.nombre}” eliminada correctamente.`);
      await cargarZonas();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  function abrirCambioEstado(zona) {
    limpiarAvisos();
    setVistaActiva("estado");
    setZonaEstado(zona);
    setMotivo("");
  }

  async function guardarCambioEstado(evento) {
    evento.preventDefault();
    if (!zonaEstado || !motivo.trim()) return;

    const nuevoEstado =
      zonaEstado.estado === "Activa" ? "Inactiva" : "Activa";

    try {
      setProcesando(true);
      limpiarAvisos();

      await cambiarEstadoZona(
        zonaEstado.id_zona,
        nuevoEstado,
        motivo.trim()
      );

      setZonaEstado(null);
      setVistaActiva("catalogo");
      setMensaje(`Zona cambiada a ${nuevoEstado}.`);
      await cargarZonas();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function abrirHistorial(zona) {
    limpiarAvisos();
    setVistaActiva("historial");
    setZonaHistorial(zona);
    setHistorial([]);
    setCargandoHistorial(true);

    try {
      const respuesta = await consultarHistorialZona(zona.id_zona);
      setHistorial(respuesta.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoHistorial(false);
    }
  }

  async function enviarSolicitud(evento) {
    evento.preventDefault();
    if (!formSolicitud.latitud.trim() || !formSolicitud.longitud.trim()) { setError("La solicitud necesita latitud y longitud GPS."); return; }
    try {
      setProcesando(true); limpiarAvisos();
      await crearSolicitudZona(formSolicitud);
      setFormSolicitud({ nombre: "", ubicacion: "", descripcion: "", latitud: "", longitud: "", nivel_riesgo_sugerido: "MEDIO" });
      const respuesta = await listarSolicitudesMias(); setSolicitudes(respuesta.data || []);
      setVistaActiva("catalogo"); setMensaje("Solicitud enviada para evaluación.");
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  }

  async function resolverSolicitud(evento, estado) {
    evento.preventDefault();
    if (!solicitudActiva) return;
    if (estado === "RECHAZADA" && !notaEvaluacion.trim()) {
      setError("Escribe el motivo en Observación antes de rechazar la solicitud.");
      return;
    }
    try {
      setProcesando(true); limpiarAvisos();
      await evaluarSolicitud(solicitudActiva.id_solicitud, estado, notaEvaluacion);
      const respuesta = await listarSolicitudesPendientes(); setPendientes(respuesta.data || []);
      if (estado === "APROBADA") await cargarZonas();
      setSolicitudActiva(null); setNotaEvaluacion("");
      setMensaje(`Solicitud ${estado.toLowerCase()}.`);
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  }

  async function guardarInspeccion(evento) {
    evento.preventDefault();
    try {
      setProcesando(true); limpiarAvisos();
      await registrarInspeccion({ ...formInspeccion, id_zona: Number(zonaInspeccion) });
      const respuesta = await listarInspecciones(zonaInspeccion); setInspecciones(respuesta.data || []);
      setMensaje("Inspección registrada.");
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  }

  async function cargarInspecciones(idZona) {
    setZonaInspeccion(idZona);
    if (!idZona) { setInspecciones([]); return; }
    try { const respuesta = await listarInspecciones(idZona); setInspecciones(respuesta.data || []); }
    catch (err) { setError(err.message); }
  }

  async function guardarZonaNueva(evento) {
    evento.preventDefault();
    const lat = formZonaNueva.latitud.trim(); const lng = formZonaNueva.longitud.trim();
    if ((lat === "") !== (lng === "")) { setError("Completa latitud y longitud juntas."); return; }
    if (lat === "" || lng === "") { setError("Registra o captura las coordenadas GPS de la zona."); return; }
    let coordenadas = [{ lat: Number(lat), lng: Number(lng) }];
    if (formZonaNueva.coordenadas.trim()) {
      try { coordenadas = JSON.parse(formZonaNueva.coordenadas); }
      catch { setError("El polígono debe ser una lista JSON de puntos con lat y lng."); return; }
      if (!Array.isArray(coordenadas) || coordenadas.length < 3 || coordenadas.some((p) => !p || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng)))) {
        setError("El polígono necesita al menos tres puntos GPS válidos."); return;
      }
      coordenadas = coordenadas.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    }
    try {
      setProcesando(true); limpiarAvisos();
      await crearZona({ nombre: formZonaNueva.nombre, ubicacion: formZonaNueva.ubicacion, descripcion: formZonaNueva.descripcion, nivel_riesgo: formZonaNueva.nivel_riesgo, coordenadas });
      setFormZonaNueva({ nombre: "", ubicacion: "", descripcion: "", nivel_riesgo: "MEDIO", latitud: "", longitud: "", coordenadas: "" });
      await cargarZonas(); setMensaje("Zona registrada.");
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  }

  async function guardarAlerta(evento) {
    evento.preventDefault();
    if (!zonaAlerta) return;
    try {
      setProcesando(true); limpiarAvisos();
      await emitirAlertaZona(zonaAlerta.id_zona, { mensaje: mensajeAlerta.trim() || `Alerta preventiva para ${zonaAlerta.nombre}`, nivel_alerta: zonaAlerta.nivel_riesgo === "EXTREMO" ? "Roja" : "Naranja" });
      setZonaAlerta(null); setMensajeAlerta(""); await cargarZonas(); setVistaActiva("catalogo"); setMensaje("Alerta preventiva emitida.");
    } catch (err) { setError(err.message); } finally { setProcesando(false); }
  }

  return (
    <AppLayout ancha suelta>
      <div className="zr-pagina">
        <header className="zr-cabecera">
          <div>
            <span className="zr-etiqueta">
              Gestión de Zonas de Riesgo
            </span>
            <h1>Zonas de Riesgo</h1>
            <p>
              Consulta, modificación y seguimiento de zonas
              mediante un historial de estados.
            </p>
          </div>
          <button
            className="zr-boton zr-secundario"
            onClick={cargarZonas}
            disabled={cargando}
          >
            Actualizar listado
          </button>
        </header>

        <nav className="zr-navegacion" aria-label="Acciones de zonas de riesgo">
          <button type="button" className={`zr-boton ${vistaActiva === "catalogo" ? "zr-primario" : "zr-secundario"}`} onClick={() => { limpiarAvisos(); setVistaActiva("catalogo"); }}>Catálogo de zonas</button>
          {esAdmin && <>
            <button type="button" className={`zr-boton ${vistaActiva === "registrar" ? "zr-primario" : "zr-secundario"}`} onClick={() => { limpiarAvisos(); setVistaActiva("registrar"); }}>Registrar zona</button>
            <button type="button" className={`zr-boton ${vistaActiva === "solicitudes" ? "zr-primario" : "zr-secundario"}`} onClick={() => { limpiarAvisos(); setVistaActiva("solicitudes"); }}>Solicitudes ({pendientes.length})</button>
            <button type="button" className={`zr-boton ${vistaActiva === "seleccionar-modificar" ? "zr-primario" : "zr-secundario"}`} onClick={() => { limpiarAvisos(); setVistaActiva("seleccionar-modificar"); }}>Modificar zona</button>
          </>}
          {esCiudadano && <button type="button" className={`zr-boton ${vistaActiva === "solicitud" ? "zr-primario" : "zr-secundario"}`} onClick={() => { limpiarAvisos(); setVistaActiva("solicitud"); }}>Solicitar zona</button>}
          {esBombero && <button type="button" className={`zr-boton ${vistaActiva === "inspeccion" ? "zr-primario" : "zr-secundario"}`} onClick={() => { limpiarAvisos(); setVistaActiva("inspeccion"); }}>Registrar inspección</button>}
        </nav>

        {error && <p role="alert" className="zr-error">{error}</p>}
        {mensaje && <p role="status" className="zr-exito">{mensaje}</p>}

        {esAdmin && vistaActiva === "seleccionar-modificar" && <section className="zr-panel">
          <h2>Selecciona una zona para modificar</h2>
          {!zonas.length ? <p>No hay zonas registradas.</p> : <div className="zr-grid">{zonas.map((zona) => <article className="zr-tarjeta" key={zona.id_zona}><h3>{zona.nombre}</h3><p>{zona.ubicacion} · Riesgo {zona.nivel_riesgo}</p><button className="zr-boton zr-primario" onClick={() => abrirEdicion(zona)}>Modificar</button></article>)}</div>}
        </section>}

        {esCiudadano && vistaActiva === "solicitud" && <section className="zr-panel">
          <h2>Solicitar registro de zona</h2>
          <form className="zr-formulario" onSubmit={enviarSolicitud}>
            <label>Nombre<input required value={formSolicitud.nombre} onChange={(e) => setFormSolicitud({ ...formSolicitud, nombre: e.target.value })} /></label>
            <label>Ubicación<input required value={formSolicitud.ubicacion} onChange={(e) => setFormSolicitud({ ...formSolicitud, ubicacion: e.target.value })} placeholder="Dirección, referencia o enlace compartido de Google Maps" /></label>
            <label>Descripción<textarea required rows={3} value={formSolicitud.descripcion} onChange={(e) => setFormSolicitud({ ...formSolicitud, descripcion: e.target.value })} /></label>
            <label>Nivel de riesgo sugerido<select value={formSolicitud.nivel_riesgo_sugerido} onChange={(e) => setFormSolicitud({ ...formSolicitud, nivel_riesgo_sugerido: e.target.value })}>{["BAJO", "MEDIO", "ALTO", "EXTREMO"].map((n) => <option key={n}>{n}</option>)}</select></label>
            <button type="button" className="zr-boton zr-secundario" onClick={() => capturarUbicacion(setFormSolicitud)}>Usar mi ubicación actual</button>
            <button type="button" className="zr-boton zr-secundario" disabled={procesando} onClick={() => resolverUbicacionFormulario(setFormSolicitud, formSolicitud)}>Obtener GPS desde enlace de Google Maps</button>
            <p className="zr-ayuda-gps">Si estás en el lugar, usa “mi ubicación actual”. Si estás en otro sitio, pega el enlace de Maps arriba.</p>
            {formSolicitud.latitud !== "" && formSolicitud.longitud !== "" && <p className="zr-gps-listo">Ubicación GPS lista para enviar.</p>}
            <details className="zr-coordenadas-manuales"><summary>Ingresar coordenadas manualmente</summary><div className="zr-campos-dobles"><label>Latitud<input type="number" min="-90" max="90" step="any" value={formSolicitud.latitud} onChange={(e) => setFormSolicitud({ ...formSolicitud, latitud: e.target.value })} /></label><label>Longitud<input type="number" min="-180" max="180" step="any" value={formSolicitud.longitud} onChange={(e) => setFormSolicitud({ ...formSolicitud, longitud: e.target.value })} /></label></div></details>
            <button className="zr-boton zr-primario" disabled={procesando}>Enviar solicitud</button>
          </form>
          <h3>Mis solicitudes</h3>
          {solicitudes.length ? <ul className="zr-lista">{solicitudes.map((s) => <li key={s.id_solicitud}><strong>{s.nombre}</strong> · {s.estado}{s.observacion_admin ? ` · ${s.observacion_admin}` : ""}</li>)}</ul> : <p>Aún no tienes solicitudes.</p>}
        </section>}

        {esAdmin && vistaActiva === "registrar" && <section className="zr-panel">
          <h2>Registrar zona de riesgo</h2>
          <form className="zr-formulario" onSubmit={guardarZonaNueva}>
            <label>Nombre<input required value={formZonaNueva.nombre} onChange={(e) => setFormZonaNueva({ ...formZonaNueva, nombre: e.target.value })} /></label>
            <label>Ubicación<input required value={formZonaNueva.ubicacion} onChange={(e) => setFormZonaNueva({ ...formZonaNueva, ubicacion: e.target.value })} placeholder="Dirección o referencia del lugar" /></label>
            <label>Descripción<textarea rows={2} value={formZonaNueva.descripcion} onChange={(e) => setFormZonaNueva({ ...formZonaNueva, descripcion: e.target.value })} /></label>
            <label>Nivel de riesgo<select value={formZonaNueva.nivel_riesgo} onChange={(e) => setFormZonaNueva({ ...formZonaNueva, nivel_riesgo: e.target.value })}>{["BAJO", "MEDIO", "ALTO", "EXTREMO"].map((n) => <option key={n}>{n}</option>)}</select></label>
            <button type="button" className="zr-boton zr-secundario" onClick={() => capturarUbicacion(setFormZonaNueva)}>Usar mi ubicación actual</button>
            <p className="zr-ayuda-gps">Registra la ubicación GPS usando la ubicación actual del dispositivo o ingresando latitud y longitud manualmente.</p>
            {formZonaNueva.latitud !== "" && formZonaNueva.longitud !== "" && <p className="zr-gps-listo">Ubicación GPS lista para registrar.</p>}
            <details className="zr-coordenadas-manuales"><summary>Ingresar coordenadas manualmente</summary><div className="zr-campos-dobles"><label>Latitud<input type="number" min="-90" max="90" step="any" value={formZonaNueva.latitud} onChange={(e) => setFormZonaNueva({ ...formZonaNueva, latitud: e.target.value })} /></label><label>Longitud<input type="number" min="-180" max="180" step="any" value={formZonaNueva.longitud} onChange={(e) => setFormZonaNueva({ ...formZonaNueva, longitud: e.target.value })} /></label></div></details>
            <label>Polígono cartográfico (opcional)<textarea rows={3} value={formZonaNueva.coordenadas} onChange={(e) => setFormZonaNueva({ ...formZonaNueva, coordenadas: e.target.value })} placeholder={'[{"lat": -17.30, "lng": -66.19}, {"lat": -17.31, "lng": -66.18}, {"lat": -17.32, "lng": -66.20}]'} /></label>
            <p className="zr-ayuda-gps">Para delimitar el área, ingresa al menos 3 puntos GPS en orden como una lista JSON. Si lo dejas vacío, se guarda solo el punto GPS principal. Actualmente el mapa guarda y ubica los puntos, pero no dibuja el contorno.</p>
            <button className="zr-boton zr-primario" disabled={procesando}>Registrar zona</button>
          </form>
        </section>}

        {esAdmin && vistaActiva === "solicitudes" && <section className="zr-panel">
          <h2>Solicitudes pendientes ({pendientes.length})</h2>
          {!pendientes.length ? <p>No hay solicitudes pendientes.</p> : pendientes.map((s) => <article className="zr-tarjeta" key={s.id_solicitud}><h3>{s.nombre}</h3><p>{s.ubicacion} · Riesgo sugerido: {s.nivel_riesgo_sugerido || "Sin sugerencia"}</p><p>{s.descripcion}</p><button className="zr-boton zr-secundario" onClick={() => setSolicitudActiva(s)}>Evaluar solicitud</button></article>)}
          {solicitudActiva && <form className="zr-formulario zr-evaluacion" onSubmit={(e) => e.preventDefault()}><h3>Evaluar: {solicitudActiva.nombre}</h3><label>Observación<textarea rows={3} value={notaEvaluacion} onChange={(e) => setNotaEvaluacion(e.target.value)} placeholder="Escribe el motivo del rechazo o una nota para el ciudadano" /></label><p className="zr-ayuda-gps">Para rechazar, escribe el motivo en Observación. Al aprobar, se registrará la zona con la ubicación GPS enviada.</p><div className="zr-acciones"><button type="button" className="zr-boton zr-primario" disabled={procesando} onClick={(e) => resolverSolicitud(e, "APROBADA")}>Aprobar y registrar zona</button><button type="button" className="zr-boton zr-secundario" disabled={procesando} onClick={(e) => resolverSolicitud(e, "RECHAZADA")}>Rechazar solicitud</button><button type="button" className="zr-boton zr-secundario" disabled={procesando} onClick={() => { setSolicitudActiva(null); setNotaEvaluacion(""); }}>Cancelar</button></div></form>}
        </section>}

        {esBombero && vistaActiva === "inspeccion" && <section className="zr-panel">
          <h2>Registrar inspección</h2>
          <form className="zr-formulario" onSubmit={guardarInspeccion}>
            <label>Zona<select required value={zonaInspeccion} onChange={(e) => cargarInspecciones(e.target.value)}><option value="">Selecciona una zona</option>{zonas.map((z) => <option key={z.id_zona} value={z.id_zona}>{z.nombre}</option>)}</select></label>
            <label>Nivel observado<select value={formInspeccion.nivel_riesgo_observado} onChange={(e) => setFormInspeccion({ ...formInspeccion, nivel_riesgo_observado: e.target.value })}>{["BAJO", "MEDIO", "ALTO", "EXTREMO"].map((n) => <option key={n}>{n}</option>)}</select></label>
            <label>Observaciones<textarea required rows={3} value={formInspeccion.observaciones} onChange={(e) => setFormInspeccion({ ...formInspeccion, observaciones: e.target.value })} /></label>
            <label>Recomendaciones<textarea rows={2} value={formInspeccion.recomendaciones} onChange={(e) => setFormInspeccion({ ...formInspeccion, recomendaciones: e.target.value })} /></label>
            <button className="zr-boton zr-primario" disabled={procesando || !zonaInspeccion}>Guardar inspección</button>
          </form>
          <h3>Inspecciones de esta zona</h3>{inspecciones.map((i) => <article className="zr-tarjeta" key={i.id_inspeccion}><strong>{i.nivel_riesgo_observado}</strong><p>{i.observaciones}</p><small>{i.fecha_inspeccion ? new Date(i.fecha_inspeccion).toLocaleString("es-BO") : ""}</small></article>)}
        </section>}

        {vistaActiva === "catalogo" && <section className="zr-panel zr-zonas-panel">
          <h2>Zonas registradas ({zonas.length})</h2>

          {zonaEnMapa && (
            <div className="zr-mapa">
              <div className="zr-tarjeta-superior">
                <h3>Mapa: {zonaEnMapa.nombre}</h3>
                <button className="zr-boton zr-secundario" onClick={() => setZonaEnMapa(null)}>Cerrar mapa</button>
              </div>
              {(() => {
                const punto = Array.isArray(zonaEnMapa.coordenadas) ? zonaEnMapa.coordenadas[0] : null;
                const lat = Number(punto?.lat);
                const lng = Number(punto?.lng);
                const tienePunto = Number.isFinite(lat) && Number.isFinite(lng);
                const src = tienePunto
                  ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.03}%2C${lat - 0.03}%2C${lng + 0.03}%2C${lat + 0.03}&layer=mapnik&marker=${lat}%2C${lng}`
                  : `https://www.google.com/maps?q=${encodeURIComponent(zonaEnMapa.ubicacion)}&output=embed`;
                const enlaceMapa = tienePunto
                  ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(zonaEnMapa.ubicacion)}`;
                return <><iframe title={`Mapa de ${zonaEnMapa.nombre}`} src={src} loading="lazy" /><a href={enlaceMapa} target="_blank" rel="noreferrer">Abrir ubicación en el mapa</a></>;
              })()}
              <p>La ubicación del mapa depende de las coordenadas GPS registradas para la zona.</p>
            </div>
          )}

          {cargando ? (
            <p>Cargando zonas...</p>
          ) : zonas.length === 0 ? (
            <p>No se encontraron zonas registradas.</p>
          ) : (
            <div className="zr-grid">
              {zonas.map((zona) => (
                <article className="zr-tarjeta" key={zona.id_zona}>
                  <div className="zr-tarjeta-superior">
                    <h3>{zona.nombre}</h3>
                    <span className={`zr-estado ${
                      zona.estado === "Activa" ? "zr-activa" : zona.estado === "Alerta Emitida" ? "zr-alerta-emitida" : "zr-inactiva"
                    }`}>
                      {zona.estado || "Sin estado"}
                    </span>
                  </div>

                  <p><strong>Ubicación:</strong> {zona.ubicacion}</p>
                  <p><strong>Riesgo:</strong> {zona.nivel_riesgo}</p>
                  <p><strong>Vegetación:</strong> {zona.tipo_vegetacion || "No especificada"}</p>

                  <div className="zr-acciones">
                    <button className="zr-boton zr-secundario" onClick={() => setZonaEnMapa(zona)}>Ver mapa</button>
                    {(esAdmin || usuario?.rol === "OPERADOR") && zona.estado !== "Alerta Emitida" && ["ALTO", "EXTREMO"].includes(zona.nivel_riesgo) && <button className="zr-boton zr-secundario" onClick={() => { setZonaAlerta(zona); setVistaActiva("alerta"); }}>Emitir alerta</button>}
                    {esAdmin && (
                      <>
                        <button
                          className="zr-boton zr-primario"
                          disabled={procesando}
                          onClick={() => abrirEdicion(zona)}
                        >
                          Modificar
                        </button>

                        <button
                          className="zr-boton zr-secundario"
                          disabled={procesando}
                          onClick={() => borrarZona(zona)}
                        >
                          Eliminar
                        </button>

                        {["Activa", "Inactiva"].includes(zona.estado) && (
                          <button
                            className="zr-boton zr-secundario"
                            onClick={() => abrirCambioEstado(zona)}
                          >
                            {zona.estado === "Activa" ? "Inactivar" : "Activar"}
                          </button>
                        )}
                      </>
                    )}

                    {esAdmin && (
                      <button
                        className="zr-boton zr-secundario"
                        onClick={() => abrirHistorial(zona)}
                      >
                        Ver historial
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>}

        {zonaAlerta && vistaActiva === "alerta" && <section className="zr-panel"><h2>Alerta preventiva: {zonaAlerta.nombre}</h2><form className="zr-formulario" onSubmit={guardarAlerta}><label>Mensaje de alerta<textarea rows={3} value={mensajeAlerta} onChange={(e) => setMensajeAlerta(e.target.value)} placeholder="Describe la recomendación preventiva" /></label><div className="zr-acciones"><button className="zr-boton zr-primario" disabled={procesando}>Emitir alerta {zonaAlerta.nivel_riesgo === "EXTREMO" ? "roja" : "naranja"}</button><button type="button" className="zr-boton zr-secundario" onClick={() => { setZonaAlerta(null); setVistaActiva("catalogo"); }}>Cancelar</button></div></form></section>}

        {zonaEditando && vistaActiva === "modificar" && (
          <section className="zr-panel">
            <h2>Modificar: {zonaEditando.nombre}</h2>
            <form onSubmit={guardarEdicion} className="zr-formulario">
              <label>
                Nombre
                <input
                  required
                  value={formulario.nombre}
                  onChange={(e) =>
                    setFormulario({ ...formulario, nombre: e.target.value })
                  }
                />
              </label>

              <label>
                Ubicación
                <input
                  required
                  value={formulario.ubicacion}
                  onChange={(e) =>
                    setFormulario({ ...formulario, ubicacion: e.target.value })
                  }
                />
              </label>

              <label>
                Tipo de vegetación
                <input
                  value={formulario.tipo_vegetacion}
                  onChange={(e) =>
                    setFormulario({ ...formulario, tipo_vegetacion: e.target.value })
                  }
                />
              </label>

              <label>
                Nivel de riesgo
                <select value={formulario.nivel_riesgo} onChange={(e) => setFormulario({ ...formulario, nivel_riesgo: e.target.value })}>
                  {["BAJO", "MEDIO", "ALTO", "EXTREMO"].map((nivel) => <option key={nivel}>{nivel}</option>)}
                </select>
              </label>

              <label>
                Descripción
                <textarea
                  rows={3}
                  value={formulario.descripcion}
                  onChange={(e) =>
                    setFormulario({ ...formulario, descripcion: e.target.value })
                  }
                />
              </label>

              <label>
                Ubicación GPS o puntos del polígono (JSON)
                <textarea rows={4} required value={formulario.coordenadas || ""} onChange={(e) => setFormulario({ ...formulario, coordenadas: e.target.value })} placeholder={'[{"lat": -17.30, "lng": -66.19}] o una lista de 3+ puntos'} />
              </label>

              <div className="zr-acciones">
                <button className="zr-boton zr-primario" disabled={procesando}>
                  Guardar cambios
                </button>
                <button
                  type="button"
                  className="zr-boton zr-secundario"
                  onClick={() => { setZonaEditando(null); setVistaActiva("catalogo"); }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        )}

        {zonaEstado && vistaActiva === "estado" && (
          <section className="zr-panel">
            <h2>
              {zonaEstado.estado === "Activa" ? "Inactivar" : "Activar"}
              {" "}{zonaEstado.nombre}
            </h2>
            <form onSubmit={guardarCambioEstado} className="zr-formulario">
              <label>
                Motivo del cambio
                <textarea
                  required
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Explique por qué cambiará el estado de esta zona"
                />
              </label>

              <div className="zr-acciones">
                <button
                  className="zr-boton zr-primario"
                  disabled={procesando || !motivo.trim()}
                >
                  Confirmar cambio
                </button>
                <button
                  type="button"
                  className="zr-boton zr-secundario"
                  onClick={() => { setZonaEstado(null); setVistaActiva("catalogo"); }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        )}

        {zonaHistorial && vistaActiva === "historial" && (
          <section className="zr-panel">
            <h2>Historial: {zonaHistorial.nombre}</h2>

            {cargandoHistorial ? (
              <p>Cargando historial...</p>
            ) : historial.length === 0 ? (
              <p>Esta zona no tiene cambios de estado registrados.</p>
            ) : (
              <div className="zr-tabla-contenedor">
                <table className="zr-tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Estado anterior</th>
                      <th>Estado nuevo</th>
                      <th>Usuario</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((registro) => (
                      <tr key={registro.id_historial}>
                        <td>{new Date(registro.fecha_cambio).toLocaleString("es-BO")}</td>
                        <td>{registro.estado_anterior}</td>
                        <td>{registro.estado_nuevo}</td>
                        <td>#{registro.id_usuario}</td>
                        <td>{registro.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              className="zr-boton zr-secundario"
              onClick={() => { setZonaHistorial(null); setVistaActiva("catalogo"); }}
            >
              Cerrar historial
            </button>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
