# Iteración: Gestión de zonas de riesgo

La iteración quedó integrada en la aplicación principal:

- Interfaz React: `frontend/src/pages/zonas/` y `frontend/src/services/zonasService.js`.
- API Flask: modelos, servicios, controladores y rutas de zonas, solicitudes e inspecciones.
- Esquema aditivo: `backend/migrations/005_zonas_riesgo.sql`.

## Casos conectados

- Consultar zonas de riesgo y ver su ubicación en el mapa.
- Registrar una zona, asignar nivel de riesgo y guardar un punto GPS o un polígono de tres o más puntos.
- Modificar zonas y activar/inactivar con motivo e historial.
- Eliminar zonas como administrador; se eliminan sus registros dependientes y se conservan incidentes y solicitudes aprobadas sin vínculo a la zona.
- Solicitar el registro de una zona como ciudadano y consultar las solicitudes propias.
- Evaluar solicitudes como administrador. Aprobar crea la zona; rechazar requiere observación.
- Registrar inspecciones como bombero y consultar inspecciones por zona.
- Emitir alertas preventivas para zonas de nivel alto o extremo.

Para el registro directo de zonas por parte del administrador, el punto GPS se obtiene desde la ubicación actual del dispositivo o se ingresa manualmente como latitud y longitud. La opción de resolver enlaces de Google Maps queda disponible en el formulario de solicitud ciudadana.

Los flujos usan la autenticación y roles del sistema principal. El código de solicitudes e inspecciones de Jhon dependía de un header temporal `X-Persona-Id` y de otra instancia de SQLAlchemy; esos accesos se adaptaron al token y a `db` de esta aplicación.

La delimitación del polígono se ingresa como una lista JSON de puntos GPS. La vista de mapa muestra la ubicación mediante el mapa externo y su marcador; todavía no dibuja el contorno del polígono sobre el mapa.

## Base de datos

Ejecutar `backend/migrations/005_zonas_riesgo.sql` sobre la base PostgreSQL del sistema. Usa `IF NOT EXISTS` y no elimina tablas ni filas. Se puede volver a ejecutar para completar una ejecución anterior que se detuvo a mitad. La tabla preexistente de solicitudes usa `id_solicitante`, `nivel_riesgo`, `motivo_evaluacion` e `id_administrador`; el modelo de la aplicación ya mapea esos nombres. La migración añade los campos faltantes para GPS, evidencia e identificación de la zona aprobada.
