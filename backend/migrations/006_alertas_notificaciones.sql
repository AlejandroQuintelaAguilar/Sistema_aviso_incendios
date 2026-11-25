-- Iteración 6: gestión de alertas y notificaciones.
-- Migración aditiva y re-ejecutable: no elimina tablas ni filas.

CREATE TABLE IF NOT EXISTS tipos_alerta (
    id_tipo_alerta SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    plantilla_mensaje TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alertas (
    id_alerta SERIAL PRIMARY KEY,
    id_incidente INT REFERENCES incidentes(id_incidente) ON DELETE CASCADE,
    id_tipo_alerta INT NOT NULL REFERENCES tipos_alerta(id_tipo_alerta) ON DELETE RESTRICT,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mensaje TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerta_destinatarios (
    id_alerta INT NOT NULL REFERENCES alertas(id_alerta) ON DELETE CASCADE,
    id_persona INT NOT NULL REFERENCES personas(id_persona) ON DELETE CASCADE,
    estado_envio VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (estado_envio IN ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'ENTREGADO')),
    confirmada BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_confirmacion TIMESTAMPTZ,
    PRIMARY KEY (id_alerta, id_persona)
);

CREATE INDEX IF NOT EXISTS idx_alertas_fecha_hora
    ON alertas (fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_alerta_destinatarios_persona
    ON alerta_destinatarios (id_persona, id_alerta DESC);

-- Plantillas usadas por AlertasService.
INSERT INTO tipos_alerta (nombre, plantilla_mensaje) VALUES
    ('ALERTA ROJA - EVACUACIÓN', 'URGENTE: Incendio descontrolado avanzando hacia {zona}. Evacúe inmediatamente hacia {refugio}.'),
    ('ALERTA AMARILLA - PREVENCIÓN', 'PRECAUCIÓN: Foco de calor detectado en {zona}. Evite realizar chaqueos o encender fogatas.'),
    ('ALERTA VERDE - CONTROLADO', 'AVISO: El incendio en {zona} ha sido contenido y liquidado por las cuadrillas de bomberos.')
ON CONFLICT (nombre) DO NOTHING;
