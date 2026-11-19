# Sistema de Incendios

Proyecto académico para la gestión de incendios forestales. Backend **Flask + PostgreSQL**,
frontend **React**, arquitectura **MVC** y desarrollo por iteraciones.

> **Estado actual:** los módulos activos son **Usuarios** (acceso, registro de ciudadano, sesión y administración de cuentas) y **Recursos y Estaciones** (alta y consulta de estaciones, unidades y recursos). El resto de la interfaz se retiró de esta iteración; la guía corta para continuar está en `GUIA_GRUPOS.md`.

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
├─ .env.local                # variables de Neon (NO se sube a git)
├─ .neon                     # vínculo con el proyecto de Neon
└─ .gitignore
```

## Iteraciones

1. Gestión de usuarios
2. Gestión de recursos y estaciones

## Instalación

No hay dependencias nuevas para esta iteración: la compresión de fotos usa el `canvas` del
navegador y el endpoint de imágenes usa lo que ya traen Flask y SQLAlchemy.

```bash
# Backend
cd backend
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env           # completar DATABASE_URL y SECRET_KEY
python -m flask run --host 127.0.0.1 --port 5000

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

La columna `foto_url` de `estaciones` ya existe en Neon; el cambio aditivo está versionado en
`backend/migrations/002_agregar_foto_estaciones.sql`. Las fotos se guardan como data URL WebP en
la base de datos y se sirven por `GET /api/estaciones/<id>/foto` con autenticación. Los listados
solo devuelven `tiene_foto` para no leer el blob en cada consulta.

## Ramas e iteraciones

`main` incluye la iteración 1 (usuarios) y esta rama (`iteracion-2-recursos-estaciones`) sale de
ahí, así que integrarla en `main` es un *fast-forward* sin conflictos. En cambio, las ramas
`iteracion-3-brigadas`, `iteracion-4-zonas-riesgo`, `iteracion-5-incidentes`,
`iteracion-6-alertas-notificaciones` e `iteracion-7-estadisticas-informes` quedaron en el commit
base anterior: no incluyen la iteración 1 ni este trabajo. Para continuar, crea cada nueva rama
desde `main` actualizado; integrar esas ramas viejas tal cual generará conflictos.
