import { httpClient } from '../api/httpClient';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const avisosService = {
  listar: (filtros) => httpClient.get(`/api/avisos${buildQuery(filtros)}`),
  mios: () => httpClient.get('/api/avisos/mios'),
  obtener: (idAviso) => httpClient.get(`/api/avisos/${idAviso}`),
  cercanos: (lat, lng, radio_km = 3) =>
    httpClient.get(`/api/avisos/cercanos${buildQuery({ lat, lng, radio_km })}`),
  agrupados: (radio_km = 2.5, min_avisos = 2) =>
    httpClient.get(`/api/avisos/agrupados${buildQuery({ radio_km, min_avisos })}`),
  consolidarGrupo: (data) => httpClient.post('/api/avisos/consolidar-grupo', data),
  crear: (data) => httpClient.post('/api/avisos', data),
  enviarDescripcion: (idAviso, data) =>
    httpClient.patch(`/api/avisos/${idAviso}/descripcion`, data),
  cambiarEstado: (idAviso, estado_aviso, motivo = null) =>
    httpClient.patch(`/api/avisos/${idAviso}/estado`, {
      estado_aviso,
      ...(motivo && motivo.trim() ? { motivo: motivo.trim() } : {}),
    }),
};

export const incidentesService = {
  referencias: () => httpClient.get('/api/incidentes/referencias'),
  resumenOperativo: () => httpClient.get('/api/incidentes/resumen-operativo'),
  sateliteFirms: (params) =>
    httpClient.get(`/api/incidentes/satelite-firms${buildQuery(params)}`),
  listar: (filtros) => httpClient.get(`/api/incidentes${buildQuery(filtros)}`),
  obtener: (idIncidente) => httpClient.get(`/api/incidentes/${idIncidente}`),
  expediente: (idIncidente) =>
    httpClient.get(`/api/incidentes/${idIncidente}/expediente`),
  crear: (data) => httpClient.post('/api/incidentes', data),
  actualizar: (idIncidente, data) =>
    httpClient.patch(`/api/incidentes/${idIncidente}`, data),
  cambiarEstado: (idIncidente, estado) =>
    httpClient.patch(`/api/incidentes/${idIncidente}/estado`, { estado }),
  cerrar: (idIncidente) => httpClient.patch(`/api/incidentes/${idIncidente}/cerrar`),
};

export const despachoBrigadasService = {
  listar: (idIncidente) => httpClient.get(`/api/incidentes/${idIncidente}/brigadas`),
  sugerido: (idIncidente) =>
    httpClient.get(`/api/incidentes/${idIncidente}/despacho-sugerido`),
  asignar: (idIncidente, data) =>
    httpClient.post(`/api/incidentes/${idIncidente}/brigadas`, data),
  cambiarEstado: (idIncidente, idBrigada, estado_asignacion) =>
    httpClient.patch(`/api/incidentes/${idIncidente}/brigadas/${idBrigada}/estado`, {
      estado_asignacion,
    }),
};

export const informesBomberoService = {
  listar: (idIncidente) => httpClient.get(`/api/incidentes/${idIncidente}/informes`),
  crear: (idIncidente, data) =>
    httpClient.post(`/api/incidentes/${idIncidente}/informes`, data),
};

export const evaluacionDanosService = {
  obtener: (idIncidente) =>
    httpClient.get(`/api/incidentes/${idIncidente}/evaluacion-danos`),
  crear: (idIncidente, data) =>
    httpClient.post(`/api/incidentes/${idIncidente}/evaluacion-danos`, data),
  actualizar: (idIncidente, data) =>
    httpClient.put(`/api/incidentes/${idIncidente}/evaluacion-danos`, data),
};
