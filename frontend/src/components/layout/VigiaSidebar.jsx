import { Link } from "react-router-dom";
import Icono from "./IconosVigia";
import { useVigia } from "../../context/VigiaContext";

const OPERATIVOS = ["ADMINISTRADOR", "OPERADOR", "BOMBERO"];

const ETIQUETA_ROL = {
  ADMINISTRADOR: "Administrador",
  OPERADOR: "Operador de central",
  BOMBERO: "Bombero",
  CIUDADANO: "Ciudadano",
};

export default function VigiaSidebar({ usuario, pathname, onSalir }) {
  const { sidebarAbierto, setSidebarAbierto, colapsado, setColapsado } = useVigia();
  const rol = usuario?.rol;
  const nombre = usuario?.persona?.nombres || usuario?.nombre_usuario || "Operador";
  const inicial = nombre.trim().charAt(0).toUpperCase() || "V";
  const enRecursos = pathname.startsWith("/recursos");
  const enBrigadas = pathname.startsWith("/brigadas");
  const enUsuarios = pathname.startsWith("/usuarios");

  return (
    <>
      {sidebarAbierto && (
        <button
          type="button"
          className="vg-overlay"
          aria-label="Cerrar menú"
          onClick={() => setSidebarAbierto(false)}
        />
      )}

      <aside
        className={`vg-sidebar${sidebarAbierto ? " vg-sidebar-abierto" : ""}${
          colapsado ? " vg-sidebar-colapsado" : ""
        }`}
        aria-label="Navegación principal"
      >
        <div className="vg-sidebar-cabecera">
          <Link to="/recursos" className="vg-marca" onClick={() => setSidebarAbierto(false)}>
            <span className="vg-marca-icono"><Icono nombre="llama" tamano={22} /></span>
            <span className="vg-marca-texto">
              <strong>Vigía Territorial</strong>
              <small>Prevención y respuesta</small>
            </span>
          </Link>
          <button
            type="button"
            className="vg-icono-boton vg-sidebar-cerrar"
            onClick={() => setSidebarAbierto(false)}
            aria-label="Cerrar menú"
          >
            <Icono nombre="cerrar" tamano={18} />
          </button>
        </div>

        <nav className="vg-nav" aria-label="Módulos del sistema">
          <p className="vg-nav-titulo">Módulos</p>
          <ul className="vg-nav-lista">
            {OPERATIVOS.includes(rol) && (
              <li>
                <Link
                  to="/recursos"
                  className={`vg-nav-enlace${enRecursos ? " activo" : ""}`}
                  onClick={() => setSidebarAbierto(false)}
                  title={colapsado ? "Recursos y Estaciones" : undefined}
                  aria-current={enRecursos ? "page" : undefined}
                >
                  <span className="vg-nav-numero">1</span>
                  <Icono nombre="estacion" tamano={18} />
                  <span className="vg-nav-texto">Recursos y Estaciones</span>
                </Link>
              </li>
            )}
            {OPERATIVOS.includes(rol) && (
              <li>
                <Link
                  to="/brigadas"
                  className={`vg-nav-enlace${enBrigadas ? " activo" : ""}`}
                  onClick={() => setSidebarAbierto(false)}
                  title={colapsado ? "Brigadas" : undefined}
                  aria-current={enBrigadas ? "page" : undefined}
                >
                  <span className="vg-nav-numero">2</span>
                  <Icono nombre="escudo" tamano={18} />
                  <span className="vg-nav-texto">Brigadas</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className="vg-sidebar-pie">
          <button
            type="button"
            className="vg-colapsar"
            onClick={() => setColapsado(!colapsado)}
            aria-label={colapsado ? "Expandir menú" : "Contraer menú"}
          >
            <Icono nombre="panelLateral" tamano={18} />
            <span>Contraer menú</span>
          </button>

          {rol === "ADMINISTRADOR" && (
            <div className="vg-nav-grupo vg-nav-grupo-inferior">
              <p className="vg-nav-titulo">Cuenta</p>
              <ul className="vg-nav-lista">
                <li>
                  <Link
                    to="/usuarios"
                    className={`vg-nav-enlace${enUsuarios ? " activo" : ""}`}
                    onClick={() => setSidebarAbierto(false)}
                    title={colapsado ? "Usuarios" : undefined}
                    aria-current={enUsuarios ? "page" : undefined}
                  >
                    <span className="vg-nav-numero">3</span>
                    <Icono nombre="usuario" tamano={18} />
                    <span className="vg-nav-texto">Usuarios</span>
                  </Link>
                </li>
              </ul>
            </div>
          )}

          {usuario && (
            <div className="vg-perfil">
              <span className="vg-avatar">{inicial}</span>
              <span className="vg-perfil-datos">
                <strong>{nombre}</strong>
                <small>{ETIQUETA_ROL[rol] || rol || "Sesión activa"}</small>
              </span>
              <button
                type="button"
                className="vg-icono-boton vg-perfil-salir"
                onClick={onSalir}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <Icono nombre="salir" tamano={18} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
