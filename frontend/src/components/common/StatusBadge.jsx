const BADGE_VARIANTS = {
  PENDIENTE: 'badge-warn',
  VERIFICADO: 'badge-info',
  DESCARTADO: 'badge-muted',
  ATENDIDO: 'badge-ok',
  ACTIVO: 'badge-danger',
  CONTROLADO: 'badge-warn',
  EXTINGUIDO: 'badge-info',
  CERRADO: 'badge-muted',
  BAJO: 'badge-muted',
  BAJA: 'badge-muted',
  MEDIO: 'badge-info',
  MEDIA: 'badge-info',
  ALTO: 'badge-warn',
  ALTA: 'badge-warn',
  CRITICO: 'badge-danger',
  CATASTROFICA: 'badge-danger',
  ASIGNADA: 'badge-info',
  EN_CAMINO: 'badge-warn',
  EN_SITIO: 'badge-danger',
  LIBERADA: 'badge-ok',
  LEVE: 'badge-ok',
  MODERADO: 'badge-warn',
  SEVERO: 'badge-danger',
  TOTAL: 'badge-danger',
};

export function StatusBadge({ value }) {
  const variant = BADGE_VARIANTS[value] || 'badge-muted';
  return <span className={`badge ${variant}`}>{value}</span>;
}
