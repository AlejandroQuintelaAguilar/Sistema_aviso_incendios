# Sistema de Incendios

Proyecto académico para la gestión de incendios forestales. Backend **Flask + PostgreSQL**,
frontend **React**, arquitectura **MVC** y desarrollo por iteraciones.

> **Estado actual:** solo estructura de carpetas, configuración de conexión y documentación.
> Todavía **no hay código**; se implementará iteración por iteración.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/00-arquitectura.md](docs/00-arquitectura.md) | Capas MVC y responsabilidad de cada carpeta |
| [docs/01-conexion-base-datos.md](docs/01-conexion-base-datos.md) | Conexión a Neon y a PostgreSQL local compartido entre laptops |
| [docs/02-refresco-datos.md](docs/02-refresco-datos.md) | Cómo se reflejan los cambios entre dispositivos (refresh) |
| [docs/03-iteraciones.md](docs/03-iteraciones.md) | Las 7 iteraciones y qué va en cada capa |
| [docs/04-sincronizacion-local-neon.md](docs/04-sincronizacion-local-neon.md) | Replicación entre PostgreSQL local y Neon (patrones y límites) |

## Estructura

```
sistema_incendios/
├─ backend/                  # Flask (Modelo + Controlador + contrato de Vista)
│  ├─ app/
│  │  ├─ config/             # configuración y conexión a PostgreSQL
│  │  ├─ models/             # MODELO: entidades y tablas
│  │  ├─ controllers/        # CONTROLADOR: lógica de cada módulo
│  │  ├─ views/              # VISTA (backend): serialización y respuestas JSON
│  │  ├─ routes/             # endpoints / blueprints por módulo
│  │  ├─ services/           # lógica de negocio reutilizable
│  │  ├─ middleware/         # autenticación, roles, validaciones
│  │  └─ utils/              # helpers
│  ├─ migrations/            # cambios de esquema versionados
│  ├─ tests/                 # pruebas
│  ├─ venv/                  # entorno virtual (no se versiona)
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/                 # React
│  ├─ public/
│  └─ src/
│     ├─ api/                # cliente HTTP y estrategia de refresco
│     ├─ components/         # common/ y layout/
│     ├─ pages/              # una carpeta por iteración
│     ├─ hooks/              # hooks (incluido el de refresco)
│     ├─ context/            # estado global / sesión
│     ├─ routes/             # rutas de la aplicación
│     ├─ services/           # acceso a datos por módulo
│     ├─ styles/
│     └─ assets/
├─ database/
│  ├─ schema/                # DDL de referencia
│  ├─ seeds/                 # datos de prueba
│  └─ backups/
├─ docs/
├─ .env.local                # variables de Neon (NO se sube a git)
├─ .neon                     # vínculo con el proyecto de Neon
└─ .gitignore
```

## Iteraciones

1. Gestión de usuarios
2. Gestión de recursos y estaciones
3. Gestión de brigadas
4. Gestión de zonas de riesgo
5. Gestión de incidentes
6. Gestión de alertas y notificaciones
7. Gestión de estadísticas e informes
