import { createContext, useCallback, useContext, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const MAPA_ROL_AUTH = {
  ADMINISTRADOR: 'ADMIN',
  OPERADOR: 'OPERADOR',
  BOMBERO: 'BOMBERO',
  CIUDADANO: 'CIUDADANO',
};

const OperacionContext = createContext(null);

export function OperacionProvider({ children }) {
  const { usuario } = useAuth();
  const rolActivo = MAPA_ROL_AUTH[usuario?.rol] || 'CIUDADANO';
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [vistaIncidente, setVistaIncidente] = useState('mapa_alertas');
  const [navBadges, setNavBadges] = useState({
    mapa_alertas: null,
    avisos: null,
    incidentes: null,
    detalle: null,
  });

  const marcarSincronizado = useCallback(() => {
    setLastSync(new Date());
  }, []);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev);
  }, []);

  return (
    <OperacionContext.Provider
      value={{
        rolActivo,
        usuarioAutenticado: usuario,
        autoRefresh,
        toggleAutoRefresh,
        lastSync,
        marcarSincronizado,
        vistaIncidente,
        setVistaIncidente,
        navBadges,
        setNavBadges,
      }}
    >
      {children}
    </OperacionContext.Provider>
  );
}

export function useOperacion() {
  const ctx = useContext(OperacionContext);
  if (!ctx) {
    throw new Error('useOperacion debe usarse dentro de OperacionProvider');
  }
  return ctx;
}
