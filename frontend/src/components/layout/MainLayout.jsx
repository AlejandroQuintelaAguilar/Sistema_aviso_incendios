import { Link } from 'react-router-dom';
import { useOperacion } from '../../context/OperacionContext';
import AppLayout from './AppLayout';

const ETIQUETAS_ROL = {
  ADMINISTRADOR: 'Administrador',
  OPERADOR: 'Operador de central',
  BOMBERO: 'Bombero',
  CIUDADANO: 'Ciudadano',
};

export function MainLayout({ children }) {
  const {
    usuarioAutenticado,
    autoRefresh,
    toggleAutoRefresh,
    lastSync,
  } = useOperacion();

  const nombreUsuario = usuarioAutenticado
    ? [usuarioAutenticado.persona?.nombres, usuarioAutenticado.persona?.apellidos]
        .filter(Boolean)
        .join(' ') || usuarioAutenticado.nombre_usuario
    : '';
  const etiquetaRol =
    ETIQUETAS_ROL[usuarioAutenticado?.rol] || usuarioAutenticado?.rol || '';

  const contenido = (
    <div className="inc-shell">
      <div className="app-shell">
        {!usuarioAutenticado ? (
          <header className="inc-public-header no-print">
            <Link to="/login" className="inc-brand-link">
              <span className="inc-brand-dot" aria-hidden="true" />
              <span>Vigía Territorial · Emergencias SOS</span>
            </Link>
            <div className="header-controls">
              <button
                type="button"
                className={`live-pill ${autoRefresh ? 'is-live' : ''}`}
                onClick={toggleAutoRefresh}
                title="Activar o pausar sincronización automática cada 8s"
              >
                <span className="live-dot" />
                {autoRefresh ? 'En vivo' : 'Pausado'}
                {lastSync && ` · ${lastSync.toLocaleTimeString()}`}
              </button>
              <Link to="/login" className="inc-login-pill">
                Iniciar sesión
              </Link>
            </div>
          </header>
        ) : (
          <div className="re-titulo inc-titulo-bar no-print">
            <div>
              <span className="re-etiqueta">Vigía Territorial · Operaciones y Respuesta</span>
              <h1>Centro de Comando e Incidentes</h1>
              <p>
                {nombreUsuario} · {etiquetaRol}
              </p>
            </div>

            <div className="header-controls">
              <button
                type="button"
                className={`live-pill ${autoRefresh ? 'is-live' : ''}`}
                onClick={toggleAutoRefresh}
                title="Activar o pausar sincronización automática cada 8s"
              >
                <span className="live-dot" />
                {autoRefresh ? 'En vivo' : 'Pausado'}
                {lastSync && ` · ${lastSync.toLocaleTimeString()}`}
              </button>
            </div>
          </div>
        )}
        <main className="app-main">{children}</main>
      </div>
    </div>
  );

  if (usuarioAutenticado) {
    return (
      <AppLayout ancha suelta>
        {contenido}
      </AppLayout>
    );
  }

  return contenido;
}
