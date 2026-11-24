-- Iteración de gestión de zonas de riesgo.
-- Migración aditiva: conserva los datos de zonas_riesgo existentes.

ALTER TABLE zonas_riesgo
    ADD COLUMN IF NOT EXISTS coordenadas JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS tipo_vegetacion VARCHAR(80) DEFAULT 'Sin especificar',
    ADD COLUMN IF NOT EXISTS area_hectareas NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'Activa',
    ADD COLUMN IF NOT EXISTS temperatura NUMERIC(4, 1) NOT NULL DEFAULT 25.0,
    ADD COLUMN IF NOT EXISTS humedad NUMERIC(4, 1) NOT NULL DEFAULT 40.0,
    ADD COLUMN IF NOT EXISTS velocidad_viento NUMERIC(4, 1) NOT NULL DEFAULT 15.0;

CREATE TABLE IF NOT EXISTS historial_estado_zona (
    id_historial SERIAL PRIMARY KEY,
    id_zona INTEGER NOT NULL REFERENCES zonas_riesgo(id_zona),
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    estado_anterior VARCHAR(20) NOT NULL,
    estado_nuevo VARCHAR(20) NOT NULL,
    motivo TEXT NOT NULL,
    fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_historial_estado_zona_zona_fecha
    ON historial_estado_zona (id_zona, fecha_cambio DESC);

CREATE TABLE IF NOT EXISTS solicitudes_zona_riesgo (
    id_solicitud SERIAL PRIMARY KEY,
    id_solicitante INTEGER NOT NULL REFERENCES personas(id_persona) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL,
    ubicacion TEXT NOT NULL,
    coordenadas JSONB NOT NULL DEFAULT '[]'::jsonb,
    tipo_vegetacion VARCHAR(80) NOT NULL DEFAULT 'Sin especificar',
    area_hectareas NUMERIC(12, 2) NOT NULL DEFAULT 0,
    temperatura NUMERIC(4, 1) NOT NULL DEFAULT 25,
    humedad NUMERIC(4, 1) NOT NULL DEFAULT 40,
    velocidad_viento NUMERIC(4, 1) NOT NULL DEFAULT 15,
    nivel_riesgo VARCHAR(20) CHECK (nivel_riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'EXTREMO')),
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
    motivo_evaluacion TEXT,
    id_administrador INTEGER REFERENCES personas(id_persona) ON DELETE SET NULL,
    latitud NUMERIC(9, 6),
    longitud NUMERIC(9, 6),
    evidencia TEXT,
    id_zona INTEGER REFERENCES zonas_riesgo(id_zona) ON DELETE SET NULL,
    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_evaluacion TIMESTAMPTZ
);

-- Adapta solicitudes_zona_riesgo que ya existía con id_solicitante y campos ampliados.
-- Se agregan solo los campos que no estaban en la tabla histórica.
ALTER TABLE solicitudes_zona_riesgo
    ADD COLUMN IF NOT EXISTS latitud NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitud NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS evidencia TEXT,
    ADD COLUMN IF NOT EXISTS id_zona INTEGER REFERENCES zonas_riesgo(id_zona) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS inspecciones (
    id_inspeccion SERIAL PRIMARY KEY,
    id_zona INTEGER NOT NULL REFERENCES zonas_riesgo(id_zona) ON DELETE CASCADE,
    id_inspector INTEGER NOT NULL REFERENCES personas(id_persona) ON DELETE RESTRICT,
    fecha_inspeccion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nivel_riesgo_observado VARCHAR(20) NOT NULL CHECK (nivel_riesgo_observado IN ('BAJO', 'MEDIO', 'ALTO', 'EXTREMO')),
    observaciones TEXT NOT NULL,
    recomendaciones TEXT,
    evidencia TEXT
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_zona_estado ON solicitudes_zona_riesgo (estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_zona_solicitante ON solicitudes_zona_riesgo (id_solicitante);
CREATE INDEX IF NOT EXISTS idx_inspecciones_zona_fecha ON inspecciones (id_zona, fecha_inspeccion DESC);

CREATE TABLE IF NOT EXISTS alertas_preventivas (
    id_alerta SERIAL PRIMARY KEY,
    id_zona INTEGER NOT NULL REFERENCES zonas_riesgo(id_zona) ON DELETE CASCADE,
    nivel_alerta VARCHAR(20) NOT NULL CHECK (nivel_alerta IN ('Naranja', 'Roja')),
    mensaje TEXT NOT NULL,
    observaciones TEXT,
    emitido_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_emision TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alertas_preventivas_zona_fecha
    ON alertas_preventivas (id_zona, fecha_emision DESC);

CREATE TABLE IF NOT EXISTS focos_calor_satelital (
    id_foco SERIAL PRIMARY KEY,
    id_zona INTEGER REFERENCES zonas_riesgo(id_zona) ON DELETE CASCADE,
    latitud NUMERIC(10, 6) NOT NULL,
    longitud NUMERIC(10, 6) NOT NULL,
    temperatura_brillo NUMERIC(5, 1),
    satelite_sensor VARCHAR(50) DEFAULT 'VIIRS / NOAA-20',
    confianza VARCHAR(20) DEFAULT 'Alta',
    fecha_deteccion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS superficie_quemada_departamento (
    id_registro SERIAL PRIMARY KEY,
    anio INTEGER NOT NULL,
    departamento VARCHAR(50) NOT NULL,
    hectareas NUMERIC(14, 0) NOT NULL DEFAULT 0,
    UNIQUE (anio, departamento)
);
