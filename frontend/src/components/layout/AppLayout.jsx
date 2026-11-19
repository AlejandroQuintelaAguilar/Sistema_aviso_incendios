import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useVigia } from "../../context/VigiaContext";
import VigiaSidebar from "./VigiaSidebar";
import VigiaHeader from "./VigiaHeader";
import ModalEstacion from "../vigia/ModalEstacion";

export default function AppLayout({ children, ancha = false, suelta = false }) {
  const { usuario, cerrarSesion } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { colapsado } = useVigia();

  function salir() {
    cerrarSesion();
    navigate("/login", { replace: true });
  }

  return (
    <div className="vigia-app">
      <VigiaSidebar usuario={usuario} pathname={pathname} onSalir={salir} />

      <div className={`vg-marco${colapsado ? " vg-marco-colapsado" : ""}`}>
        <VigiaHeader pathname={pathname} usuario={usuario} />
        <main className="vg-contenido">
          {suelta ? (
            <div className="cuenta-pila">{children}</div>
          ) : (
            <section className={`cuenta-tarjeta${ancha ? " cuenta-tarjeta-ancha" : ""}`}>
              {children}
            </section>
          )}
        </main>
      </div>

      <ModalEstacion />
    </div>
  );
}
