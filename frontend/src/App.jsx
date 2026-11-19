import { AuthProvider } from "./context/AuthContext";
import { VigiaProvider } from "./context/VigiaContext";
import { useRefreshSesion } from "./hooks/useRefreshSesion";
import AppRoutes from "./routes/AppRoutes";

function RefrescoDeSesion() {
  useRefreshSesion();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <RefrescoDeSesion />
      <VigiaProvider>
        <AppRoutes />
      </VigiaProvider>
    </AuthProvider>
  );
}
