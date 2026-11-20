import { api } from "../api/client";

export function listar(filtros = {}) {
  const consulta = new URLSearchParams();
  if (filtros.estado) consulta.set("estado", filtros.estado);
  if (filtros.disponibilidad) consulta.set("disponibilidad", filtros.disponibilidad);
  const sufijo = consulta.toString() ? `?${consulta}` : "";
  return api(`/brigadas/consultar${sufijo}`);
}

export function disponibles() {
  return api("/brigadas/disponibles");
}

export function obtener(idBrigada) {
  return api(`/brigadas/${idBrigada}`);
}

export function bomberosDisponibles() {
  return api("/brigadas/bomberos-disponibles");
}

export function crear(datos) {
  return api("/brigadas", { method: "POST", body: datos });
}

export function editar(idBrigada, datos) {
  return api(`/brigadas/${idBrigada}`, { method: "PATCH", body: datos });
}

export function cambiarEstado(idBrigada, estado, motivo) {
  return api(`/brigadas/${idBrigada}/estado`, {
    method: "PATCH",
    body: { estado, motivo },
  });
}

export function desactivar(idBrigada, motivo) {
  return api(`/brigadas/${idBrigada}/desactivar`, {
    method: "PATCH",
    body: { motivo },
  });
}

export function reactivar(idBrigada, motivo) {
  return api(`/brigadas/${idBrigada}/reactivar`, {
    method: "PATCH",
    body: { motivo },
  });
}

export function miembros(idBrigada) {
  return api(`/brigadas/${idBrigada}/miembros`);
}

export function asignarMiembros(idBrigada, integrantes) {
  return api(`/brigadas/${idBrigada}/miembros`, {
    method: "POST",
    body: { miembros: integrantes },
  });
}

export function retirarMiembro(idBrigada, idPersona) {
  return api(`/brigadas/${idBrigada}/miembros/${idPersona}`, { method: "DELETE" });
}

export function incendiosAsignados() {
  return api("/brigadas/incendios-asignados");
}

export function confirmarRecepcion(idIncidente, idBrigada) {
  return api(`/brigadas/incendios/${idIncidente}/brigadas/${idBrigada}/confirmar`, {
    method: "PATCH",
  });
}
