
import { api } from "../api/client";

export function listarZonas() {
  return api("/zonas-riesgo");
}

export function modificarZona(idZona, datos) {
  return api(`/zonas-riesgo/${idZona}`, {
    method: "PUT",
    body: datos,
  });
}

export function eliminarZona(idZona) {
  return api(`/zonas-riesgo/${idZona}`, { method: "DELETE" });
}

export function cambiarEstadoZona(idZona, estado, motivo) {
  return api(`/zonas-riesgo/${idZona}/estado`, {
    method: "PATCH",
    body: { estado, motivo },
  });
}

export function consultarHistorialZona(idZona) {
  return api(`/zonas-riesgo/${idZona}/historial`);
}

export function crearZona(datos) {
  return api("/zonas-riesgo", { method: "POST", body: datos });
}

export function resolverUbicacion(ubicacion) {
  return api("/zonas-riesgo/resolver-ubicacion", { method: "POST", body: { ubicacion } });
}

export function crearSolicitudZona(datos) {
  return api("/solicitudes-zonas", { method: "POST", body: datos });
}

export function listarSolicitudesMias() {
  return api("/solicitudes-zonas/mias");
}

export function listarSolicitudesPendientes() {
  return api("/solicitudes-zonas/pendientes");
}

export function evaluarSolicitud(id, estado, observacion) {
  return api(`/solicitudes-zonas/${id}/evaluacion`, { method: "PATCH", body: { estado, observacion } });
}

export function registrarInspeccion(datos) {
  return api("/inspecciones", { method: "POST", body: datos });
}

export function listarInspecciones(idZona) {
  return api(`/inspecciones/zona/${idZona}`);
}

export function emitirAlertaZona(idZona, datos) {
  return api(`/zonas-riesgo/${idZona}/alerta`, { method: "POST", body: datos });
}
