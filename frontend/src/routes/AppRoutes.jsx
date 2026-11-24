import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import MarcoAcceso from "../components/layout/MarcoAcceso";
import CuentaPage from "../pages/usuarios/CuentaPage";
import LoginPage from "../pages/usuarios/LoginPage";
import RecuperarPage from "../pages/usuarios/RecuperarPage";
import RegistroPage from "../pages/usuarios/RegistroPage";
import RestablecerPage from "../pages/usuarios/RestablecerPage";
import UsuariosPage from "../pages/usuarios/UsuariosPage";
import FrmRegEstacion from "../pages/recursos/frmRegEstacion";
import FrmRegUnidadRecurso from "../pages/recursos/frmRegUnidadRecurso";
import ConsultaRecursosPage from "../pages/recursos/ConsultaRecursosPage";
import RecursosEstacionesPage from "../pages/recursos/RecursosEstacionesPage";
import BrigadasPage from "../pages/brigadas/BrigadasPage";
import FrmRegBrigada from "../pages/brigadas/frmRegBrigada";
import FrmEditarBrigada from "../pages/brigadas/frmEditarBrigada";
import ConsultaBrigadasPage from "../pages/brigadas/ConsultaBrigadasPage";
import IncendiosAsignadosPage from "../pages/brigadas/IncendiosAsignadosPage";
import ZonasRiesgoPage from "../pages/zonas/ZonasRiesgoPage";

function PantallaCarga() {
  return <p className="cuenta estado-pantalla">Comprobando sesión…</p>;
}

const ROLES_OPERATIVOS = ["ADMINISTRADOR", "OPERADOR", "BOMBERO"];

function RutaPrivada({ children, soloAdmin = false, roles = null }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <PantallaCarga />;
  if (!usuario) return <Navigate to="/login" replace />;
  if (soloAdmin && usuario.rol !== "ADMINISTRADOR") return <Navigate to="/recursos" replace />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/cuenta" replace />;
  return children;
}

function RutaPublica({ children }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <PantallaCarga />;
  if (usuario) {
    return <Navigate to={ROLES_OPERATIVOS.includes(usuario.rol) ? "/recursos" : "/cuenta"} replace />;
  }
  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route element={<RutaPublica><MarcoAcceso /></RutaPublica>}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegistroPage />} />
        <Route path="/recuperar" element={<RecuperarPage />} />
      </Route>
      <Route element={<MarcoAcceso />}>
        <Route path="/restablecer/:token" element={<RestablecerPage />} />
      </Route>
      <Route path="/cuenta" element={<RutaPrivada><CuentaPage /></RutaPrivada>} />

      {/* Módulos activos: Recursos y Estaciones, Brigadas y Usuarios. */}
      <Route
        path="/recursos"
        element={<RutaPrivada roles={ROLES_OPERATIVOS}><RecursosEstacionesPage /></RutaPrivada>}
      />
      <Route path="/recursos/estaciones/nueva" element={<RutaPrivada soloAdmin><FrmRegEstacion /></RutaPrivada>} />
      <Route path="/recursos/unidades/nueva" element={<RutaPrivada soloAdmin><FrmRegUnidadRecurso /></RutaPrivada>} />
      <Route path="/recursos/consultar" element={<RutaPrivada roles={ROLES_OPERATIVOS}><ConsultaRecursosPage /></RutaPrivada>} />

      {/* Iteración 3: Gestión de Brigadas. */}
      <Route path="/brigadas" element={<RutaPrivada roles={ROLES_OPERATIVOS}><BrigadasPage /></RutaPrivada>} />
      <Route path="/brigadas/nueva" element={<RutaPrivada soloAdmin><FrmRegBrigada /></RutaPrivada>} />
      <Route path="/brigadas/:idBrigada/editar" element={<RutaPrivada soloAdmin><FrmEditarBrigada /></RutaPrivada>} />
      <Route path="/brigadas/consultar" element={<RutaPrivada roles={ROLES_OPERATIVOS}><ConsultaBrigadasPage /></RutaPrivada>} />
      <Route path="/brigadas/incendios" element={<RutaPrivada roles={ROLES_OPERATIVOS}><IncendiosAsignadosPage /></RutaPrivada>} />
      <Route path="/zonas-riesgo" element={<RutaPrivada roles={[...ROLES_OPERATIVOS, "CIUDADANO"]}><ZonasRiesgoPage /></RutaPrivada>} />

      <Route path="/usuarios" element={<RutaPrivada soloAdmin><UsuariosPage /></RutaPrivada>} />

      <Route path="*" element={<Navigate to="/recursos" replace />} />
    </Routes>
  );
}
