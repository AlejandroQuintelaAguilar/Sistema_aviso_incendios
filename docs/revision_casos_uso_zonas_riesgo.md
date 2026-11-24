# Revisión de casos de uso: Zonas de Riesgo

Revisión del módulo frente al diagrama **Gestión de Zonas de Riesgo**.

## Cobertura actual

| Caso de uso | Estado | Evidencia / límite |
|---|---|---|
| Consultar zonas de riesgo | Implementado | El módulo lista zonas para ciudadano, operador, bombero y administrador. |
| Ver mapa de zonas `<<extend>>` | Parcial | La tarjeta permite abrir el mapa de una zona. El mapa muestra un marcador basado en GPS; todavía no dibuja todos los polígonos sobre un mapa común. |
| Emitir alerta preventiva `<<extend>>` | Implementado | Admin y operador pueden emitirla para riesgo alto o extremo; se guarda la alerta y cambia el estado de la zona. |
| Solicitar registro de zona | Implementado | Ciudadano envía la solicitud y consulta su estado. Ahora requiere latitud y longitud GPS. |
| Registrar ubicación GPS `<<include>>` | Implementado con validación | Admin captura su ubicación actual o ingresa coordenadas manualmente al registrar una zona. Las solicitudes ciudadanas también aceptan ubicación actual, coordenadas manuales o resolver un enlace de Google Maps. El servidor valida rangos y rechaza registros sin ubicación. |
| Definir nivel de riesgo `<<include>>` | Implementado | El formulario permite elegir BAJO, MEDIO, ALTO o EXTREMO; el servicio también dispone de cálculo por temperatura, humedad y viento. |
| Delimitar polígono `<<extend>>` | Parcial | Se aceptan listas de al menos tres puntos GPS en JSON. Falta un editor visual para dibujar el polígono directamente sobre el mapa. |
| Registrar zona de riesgo | Implementado | El administrador registra la zona; la API valida nombre, ubicación, nivel y GPS. |
| Activar / inactivar zona e incluir historial | Implementado | Solo admin cambia el estado, debe indicar motivo y el servicio registra el cambio en el historial. |
| Modificar zona de riesgo | Implementado | Admin puede editar los datos, nivel y coordenadas GPS/polígono. |
| Eliminar zona de riesgo | Implementado | Solo admin. Se elimina el historial y los registros dependientes; incidentes y solicitudes aprobadas permanecen sin vínculo con la zona. |
| Registrar inspección | Implementado | Bombero registra nivel observado, observaciones y recomendaciones para una zona. |
| Evaluar solicitud de zona | Implementado | Admin aprueba o rechaza; el rechazo exige motivo y una aprobación crea la zona solicitada. |
| Consultar historial de cambios | Parcial | Se consulta historial de activaciones e inactivaciones, no un registro general de cada edición o alerta. |

## Conclusión

Los flujos principales del diagrama están presentes. La cobertura no es completa en tres aspectos: edición cartográfica visual de polígonos, mapa conjunto con las zonas y el alcance del historial, que actualmente guarda cambios de estado. El enlace `<<extend>>` del polígono está cubierto mediante entrada de puntos, pero aún no es un dibujo interactivo.

## Presentación visual

La página de zonas usa las variables compartidas del sistema (`--vg-fuego`, `--vg-critico`, `--vg-superficie`, `--vg-input` y `--vg-borde`): naranja para acciones y acentos, superficies claras para paneles y tarjetas y tonos neutros para formularios. Esto la alinea con las demás iteraciones sin cambiar la paleta global.
