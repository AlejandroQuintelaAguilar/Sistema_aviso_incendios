// Códigos exactos de los CHECK de la base de datos, con etiqueta legible.
export const ESTADOS_BRIGADA = [
  ["ACTIVA", "Activa"],
  ["EN_OPERACION", "En operación"],
  ["DESCANSO", "En descanso"],
  ["DISUELTA", "Disuelta"],
];

export const ROLES_BRIGADA = [
  ["JEFE_CUADRILLA", "Jefe de cuadrilla"],
  ["BOMBERO", "Bombero"],
  ["ESPECIALISTA", "Especialista"],
  ["PARAMEDICO", "Paramédico"],
];

export const ESTADOS_ASIGNACION = {
  ASIGNADA: { etiqueta: "Asignada", clase: "asignada" },
  EN_CAMINO: { etiqueta: "En camino", clase: "en-camino" },
  EN_SITIO: { etiqueta: "En sitio", clase: "en-sitio" },
  LIBERADA: { etiqueta: "Liberada", clase: "liberada" },
};

const CON_MOTIVO = new Set(["DESCANSO", "DISUELTA"]);

export function requiereMotivo(estado) {
  return CON_MOTIVO.has(estado);
}

export function etiquetaEstadoBrigada(estado) {
  const encontrada = ESTADOS_BRIGADA.find(([codigo]) => codigo === estado);
  return encontrada ? encontrada[1] : estado || "Sin estado";
}

export function claseEstadoBrigada(estado) {
  return {
    ACTIVA: "disponible",
    EN_OPERACION: "en-mision",
    DESCANSO: "mantenimiento",
    DISUELTA: "fuera-servicio",
  }[estado] || "mantenimiento";
}

export function etiquetaRolBrigada(rol) {
  const encontrado = ROLES_BRIGADA.find(([codigo]) => codigo === rol);
  return encontrado ? encontrado[1] : rol || "Sin rol";
}

export const ESTADOS_MIEMBRO = {
  ACTIVO: { etiqueta: "Activo", clase: "disponible" },
  PENDIENTE: { etiqueta: "Invitación pendiente", clase: "en-mision" },
  RECHAZADA: { etiqueta: "Rechazada", clase: "fuera-servicio" },
  INACTIVO: { etiqueta: "Inactivo", clase: "mantenimiento" },
};

export function estadoMiembro(estado) {
  return ESTADOS_MIEMBRO[estado] || { etiqueta: estado || "-", clase: "mantenimiento" };
}

export function estadoNotificacion(estado) {
  return {
    PENDIENTE: { etiqueta: "Pendiente de respuesta", clase: "en-mision" },
    ACEPTADA: { etiqueta: "Aceptada", clase: "disponible" },
    RECHAZADA: { etiqueta: "Rechazada", clase: "fuera-servicio" },
  }[estado] || { etiqueta: estado || "-", clase: "mantenimiento" };
}

export function estadoAsignacion(estado) {
  return ESTADOS_ASIGNACION[estado] || { etiqueta: estado || "-", clase: "liberada" };
}
