# Arquitectura MVC

## Capas y responsabilidades

| Capa | Carpeta | Responsabilidad | No debe contener |
|---|---|---|---|
| **Modelo** | `backend/app/models/` | Entidades, relaciones, reglas de persistencia y acceso a PostgreSQL | Rutas, HTML, lógica de la interfaz |
| **Controlador** | `backend/app/controllers/` | Casos de uso: validar, decidir, llamar al modelo y devolver resultado | SQL directo disperso, JSX |
| **Rutas** | `backend/app/routes/` | Exponer endpoints HTTP y delegar al controlador | Lógica de negocio |
| **Vista (backend)** | `backend/app/views/` | Contrato de salida: serializar entidades a JSON y códigos HTTP | Consultas a la base |
| **Vista (frontend)** | `frontend/src/` | Pantallas, componentes y estado de la interfaz | Conexión directa a PostgreSQL |
| **Configuración** | `backend/app/config/` | Variables de entorno, conexión y parámetros | Reglas de negocio |
| **Servicios** | `backend/app/services/` | Lógica compartida entre módulos (ej. notificaciones) | Respuestas HTTP |
| **Middleware** | `backend/app/middleware/` | Sesión, roles, permisos, validaciones transversales | Vistas |

## Flujo de una petición

```
React (Vista)
  → frontend/src/api            (cliente HTTP)
    → backend/app/routes        (endpoint)
      → backend/app/controllers (caso de uso)
        → backend/app/models    (PostgreSQL)
      ← backend/app/views       (JSON)
  ← React actualiza la pantalla
```

## Regla de organización

Cada iteración agrega **un módulo** y toca siempre las mismas capas:

- un archivo en `models/`
- un archivo en `controllers/`
- un archivo en `routes/`
- un archivo en `views/`
- una carpeta en `frontend/src/pages/`
- sus componentes en `frontend/src/components/`

No se mezclan módulos: usuarios no importa lógica de incidentes, etc. Lo compartido va en
`services/` o `utils/`.

## Convención de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Módulo backend | snake_case | `incidentes` |
| Modelo | singular | `incidente.py` → clase `Incidente` |
| Controlador | `<modulo>_controller.py` | `incidentes_controller.py` |
| Rutas | `<modulo>_routes.py` | `incidentes_routes.py` |
| Vista/serializador | `<modulo>_view.py` | `incidentes_view.py` |
| Página React | carpeta en plural | `pages/incidentes/` |
| Tabla PostgreSQL | plural snake_case | `incidentes` |

## Dónde va cada cosa (ejemplo con incidentes)

| Pregunta | Archivo |
|---|---|
| ¿Qué columnas tiene un incidente? | `backend/app/models/incidente.py` |
| ¿Qué pasa al reportarlo? | `backend/app/controllers/incidentes_controller.py` |
| ¿En qué URL se consulta? | `backend/app/routes/incidentes_routes.py` |
| ¿Cómo se devuelve en JSON? | `backend/app/views/incidentes_view.py` |
| ¿Qué ve el usuario? | `frontend/src/pages/incidentes/` |
| ¿Cómo se piden los datos? | `frontend/src/services/incidentes.js` |
| ¿Cómo se refresca la lista? | `frontend/src/hooks/` + `frontend/src/api/` |
