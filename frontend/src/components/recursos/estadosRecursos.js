export const ESTADOS_UNIDAD = {
  DISPONIBLE: { etiqueta: "En base", clase: "disponible" },
  EN_MISION: { etiqueta: "En ruta", clase: "en-mision" },
  EN_USO: { etiqueta: "En uso", clase: "en-mision" },
  MANTENIMIENTO: { etiqueta: "Mantenimiento", clase: "mantenimiento" },
  FUERA_DE_SERVICIO: { etiqueta: "Fuera de servicio", clase: "fuera-servicio" },
};

export const ESTADOS_RECURSO = {
  DISPONIBLE: { etiqueta: "Disponible", clase: "disponible" },
  EN_USO: { etiqueta: "En uso", clase: "en-mision" },
  AGOTADO: { etiqueta: "Agotado", clase: "fuera-servicio" },
  DANADO: { etiqueta: "Dañado", clase: "mantenimiento" },
  DE_BAJA: { etiqueta: "De baja", clase: "fuera-servicio" },
};

export function estadoUnidad(clave) {
  return ESTADOS_UNIDAD[clave] || { etiqueta: clave || "Sin estado", clase: "mantenimiento" };
}

export function estadoRecurso(clave) {
  return ESTADOS_RECURSO[clave] || { etiqueta: clave || "Sin estado", clase: "mantenimiento" };
}

export function iconoRecurso(tipo) {
  const valor = String(tipo || "").toLowerCase();
  if (valor.includes("agua") || valor.includes("depósito")) return "agua";
  if (valor.includes("radio") || valor.includes("comunic")) return "radio";
  if (valor.includes("herramienta") || valor.includes("manguera")) return "mantenimiento";
  if (valor.includes("equipo")) return "escudo";
  return "capas";
}
