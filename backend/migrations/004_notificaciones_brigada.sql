-- Iteración 3: notificaciones de asignación a brigada con respuesta del bombero.
-- Aditivo e idempotente. No modifica tablas de incidentes ni de otras iteraciones.

-- La tabla física solo permitía ACTIVO / INACTIVO. Se amplía para que la
-- invitación pendiente y el rechazo sean estados explícitos y auditables.
ALTER TABLE brigada_miembros DROP CONSTRAINT IF EXISTS brigada_miembros_estado_check;
ALTER TABLE brigada_miembros ADD CONSTRAINT brigada_miembros_estado_check
    CHECK (estado IN ('ACTIVO', 'INACTIVO', 'PENDIENTE', 'RECHAZADA'));

CREATE TABLE IF NOT EXISTS notificaciones_brigada (
    id_notificacion  SERIAL PRIMARY KEY,
    id_brigada       INTEGER NOT NULL REFERENCES brigadas (id_brigada) ON DELETE CASCADE,
    id_persona       INTEGER NOT NULL REFERENCES personas (id_persona) ON DELETE CASCADE,
    tipo             VARCHAR(30) NOT NULL DEFAULT 'ASIGNACION_BRIGADA',
    estado           VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    mensaje          TEXT,
    motivo_rechazo   TEXT,
    fecha_creacion   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    fecha_respuesta  TIMESTAMPTZ,
    CONSTRAINT notificaciones_brigada_estado_check
        CHECK (estado IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA'))
);

-- Solo puede existir una invitación pendiente por brigada y persona.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notificaciones_pendientes
    ON notificaciones_brigada (id_brigada, id_persona)
    WHERE estado = 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_notificaciones_persona
    ON notificaciones_brigada (id_persona, fecha_creacion DESC);
