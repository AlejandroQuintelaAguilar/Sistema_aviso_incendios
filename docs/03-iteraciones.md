# Iteraciones del proyecto

Cada iteración agrega un módulo completo pasando por todas las capas MVC. No se avanza a la
siguiente hasta que la anterior tenga: modelos, endpoints, pantalla, validaciones y evidencia en
PostgreSQL.

## Orden y dependencias

| # | Iteración | Depende de | Tablas principales |
|---|---|---|---|
| 1 | Gestión de usuarios | — | `usuarios`, `roles` |
| 2 | Gestión de recursos y estaciones | usuarios | `recursos`, `estaciones` |
| 3 | Gestión de brigadas | usuarios, recursos, estaciones | `brigadas`, `brigada_miembros` |
| 4 | Gestión de zonas de riesgo | — | `zonas_riesgo` |
| 5 | Gestión de incidentes | usuarios, brigadas, zonas | `incidentes`, `incidente_asignaciones` |
| 6 | Gestión de alertas y notificaciones | usuarios, incidentes, zonas | `alertas`, `notificaciones` |
| 7 | Gestión de estadísticas e informes | todas | vistas/consultas agregadas |

## Qué se crea en cada capa (por iteración)

| Iteración | Modelo | Controlador | Rutas | Vista backend | Página React |
|---|---|---|---|---|---|
| 1 Usuarios | `models/usuario.py` | `controllers/usuarios_controller.py` | `routes/usuarios_routes.py` | `views/usuarios_view.py` | `pages/usuarios/` |
| 2 Recursos y estaciones | `models/recurso.py`, `models/estacion.py` | `controllers/recursos_controller.py` | `routes/recursos_routes.py` | `views/recursos_view.py` | `pages/recursos/` |
| 3 Brigadas | `models/brigada.py` | `controllers/brigadas_controller.py` | `routes/brigadas_routes.py` | `views/brigadas_view.py` | `pages/brigadas/` |
| 4 Zonas de riesgo | `models/zona_riesgo.py` | `controllers/zonas_controller.py` | `routes/zonas_routes.py` | `views/zonas_view.py` | `pages/zonas/` |
| 5 Incidentes | `models/incidente.py` | `controllers/incidentes_controller.py` | `routes/incidentes_routes.py` | `views/incidentes_view.py` | `pages/incidentes/` |
| 6 Alertas y notificaciones | `models/alerta.py`, `models/notificacion.py` | `controllers/alertas_controller.py` | `routes/alertas_routes.py` | `views/alertas_view.py` | `pages/alertas/` |
| 7 Estadísticas e informes | consultas agregadas | `controllers/estadisticas_controller.py` | `routes/estadisticas_routes.py` | `views/estadisticas_view.py` | `pages/estadisticas/` |

## Criterio de aceptación de cada iteración

- [ ] La tabla existe en PostgreSQL y se ve con `\dt` / `SELECT`.
- [ ] Se puede crear, listar, editar y eliminar desde la interfaz.
- [ ] `created_at` y `updated_at` reflejan la creación y la modificación.
- [ ] Los cambios se ven en otra laptop con la misma base.
- [ ] Hay validaciones y mensajes de error claros.
- [ ] Los permisos dependen del rol del usuario.
- [ ] Queda evidencia (captura de la pantalla y del `SELECT` en PostgreSQL).

## Iteración 0 (previa, cuando se autorice escribir código)

Base técnica mínima, sin funcionalidad de negocio:

1. Estructura de la aplicación Flask y conexión a PostgreSQL.
2. Configuración de React y layout principal.
3. Refresco de datos reutilizable.
4. Manejo de sesión y roles.
5. Scripts de creación de tablas y datos de prueba en `database/`.

## Fuera de alcance por ahora

- Escribir código antes de cerrar el diseño de cada iteración.
- Cambiar de motor de base de datos.
- Conectar React directamente a PostgreSQL.
- Datos en memoria o archivos como fuente de verdad.
