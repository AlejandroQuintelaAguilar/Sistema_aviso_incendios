-- =============================================================================
-- DATOS DE PRUEBA DE LA ITERACIÓN 3: GESTIÓN DE BRIGADAS
-- =============================================================================
-- Se pueden ejecutar las veces que se quiera: usan NOT EXISTS / ON CONFLICT.
-- Contraseña de los bomberos nuevos: bombero123 (mismo hash que bombero_jorge).
-- Al final hay un bloque COMENTADO para borrar todo si se desea.

-- 1. Personas nuevas (5 bomberos de prueba)
INSERT INTO personas (nombres, apellidos, telefono, correo, direccion, tipo_persona)
SELECT 'Rosa', 'Campos Vega', '77611111', 'rosa@example.com', 'Av. Banzer #12, Central', 'BOMBERO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_rosa');

INSERT INTO personas (nombres, apellidos, telefono, correo, direccion, tipo_persona)
SELECT 'Iván', 'Torres Ruiz', '77622222', 'ivan@example.com', 'Calle Pando #88, Norte', 'BOMBERO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_ivan');

INSERT INTO personas (nombres, apellidos, telefono, correo, direccion, tipo_persona)
SELECT 'Elva', 'Mamani Quispe', '77633333', 'elva@example.com', 'Av. Colón #45, Sur', 'BOMBERO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_elva');

INSERT INTO personas (nombres, apellidos, telefono, correo, direccion, tipo_persona)
SELECT 'Néstor', 'Pardo Silva', '77644444', 'nestor@example.com', 'Calle Junín #9, Centro', 'BOMBERO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_nestor');

INSERT INTO personas (nombres, apellidos, telefono, correo, direccion, tipo_persona)
SELECT 'Dora', 'Vega Ríos', '77655555', 'dora@example.com', 'Av. Universitaria #31, Sur', 'BOMBERO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_dora');

-- 2. Usuarios (rol BOMBERO)
INSERT INTO usuarios (id_persona, id_rol, nombre_usuario, hash_contrasena, estado)
SELECT
  (SELECT p.id_persona FROM personas p WHERE p.nombres = 'Rosa' AND p.apellidos = 'Campos Vega' LIMIT 1),
  (SELECT r.id_rol FROM roles r WHERE r.nombre_rol = 'BOMBERO'),
  'bombero_rosa',
  'scrypt:32768:8:1$zZKDk0yzVJWcChdX$087ed82f99d12a89bfc0e91a0151e4efb613bcb10fff135d2e02c77f6007c5be0c25506b5121a59f76737bae84ca009612f39cc0b59467631998a974a6c7a0d5',
  'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_rosa');

INSERT INTO usuarios (id_persona, id_rol, nombre_usuario, hash_contrasena, estado)
SELECT
  (SELECT p.id_persona FROM personas p WHERE p.nombres = 'Iván' AND p.apellidos = 'Torres Ruiz' LIMIT 1),
  (SELECT r.id_rol FROM roles r WHERE r.nombre_rol = 'BOMBERO'),
  'bombero_ivan',
  'scrypt:32768:8:1$zZKDk0yzVJWcChdX$087ed82f99d12a89bfc0e91a0151e4efb613bcb10fff135d2e02c77f6007c5be0c25506b5121a59f76737bae84ca009612f39cc0b59467631998a974a6c7a0d5',
  'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_ivan');

INSERT INTO usuarios (id_persona, id_rol, nombre_usuario, hash_contrasena, estado)
SELECT
  (SELECT p.id_persona FROM personas p WHERE p.nombres = 'Elva' AND p.apellidos = 'Mamani Quispe' LIMIT 1),
  (SELECT r.id_rol FROM roles r WHERE r.nombre_rol = 'BOMBERO'),
  'bombero_elva',
  'scrypt:32768:8:1$zZKDk0yzVJWcChdX$087ed82f99d12a89bfc0e91a0151e4efb613bcb10fff135d2e02c77f6007c5be0c25506b5121a59f76737bae84ca009612f39cc0b59467631998a974a6c7a0d5',
  'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_elva');

INSERT INTO usuarios (id_persona, id_rol, nombre_usuario, hash_contrasena, estado)
SELECT
  (SELECT p.id_persona FROM personas p WHERE p.nombres = 'Néstor' AND p.apellidos = 'Pardo Silva' LIMIT 1),
  (SELECT r.id_rol FROM roles r WHERE r.nombre_rol = 'BOMBERO'),
  'bombero_nestor',
  'scrypt:32768:8:1$zZKDk0yzVJWcChdX$087ed82f99d12a89bfc0e91a0151e4efb613bcb10fff135d2e02c77f6007c5be0c25506b5121a59f76737bae84ca009612f39cc0b59467631998a974a6c7a0d5',
  'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_nestor');

-- Dora no se asigna a ninguna brigada: queda disponible para probar altas.
INSERT INTO usuarios (id_persona, id_rol, nombre_usuario, hash_contrasena, estado)
SELECT
  (SELECT p.id_persona FROM personas p WHERE p.nombres = 'Dora' AND p.apellidos = 'Vega Ríos' LIMIT 1),
  (SELECT r.id_rol FROM roles r WHERE r.nombre_rol = 'BOMBERO'),
  'bombero_dora',
  'scrypt:32768:8:1$zZKDk0yzVJWcChdX$087ed82f99d12a89bfc0e91a0151e4efb613bcb10fff135d2e02c77f6007c5be0c25506b5121a59f76737bae84ca009612f39cc0b59467631998a974a6c7a0d5',
  'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE nombre_usuario = 'bombero_dora');

-- 3. Brigadas de prueba (uno por cada estado del CHECK)
INSERT INTO brigadas (nombre, estado, motivo_estado, id_estacion)
SELECT 'Brigada Zorro - Respuesta Rápida', 'ACTIVA', 'Refuerzo de turno mañana', 1
WHERE NOT EXISTS (SELECT 1 FROM brigadas WHERE nombre = 'Brigada Zorro - Respuesta Rápida');

INSERT INTO brigadas (nombre, estado, motivo_estado, id_estacion)
SELECT 'Brigada Lince - Alta Montaña', 'EN_OPERACION', 'Despliegue en la cordillera', 2
WHERE NOT EXISTS (SELECT 1 FROM brigadas WHERE nombre = 'Brigada Lince - Alta Montaña');

INSERT INTO brigadas (nombre, estado, motivo_estado, id_estacion)
SELECT 'Brigada Águila - Reserva', 'DESCANSO', 'Rotación y descanso del personal', 1
WHERE NOT EXISTS (SELECT 1 FROM brigadas WHERE nombre = 'Brigada Águila - Reserva');

INSERT INTO brigadas (nombre, estado, motivo_estado, id_estacion)
SELECT 'Brigada Oso - Histórica', 'DISUELTA', 'Baja por reestructuración', 2
WHERE NOT EXISTS (SELECT 1 FROM brigadas WHERE nombre = 'Brigada Oso - Histórica');

-- 4. Integrantes
-- Zorro: Rosa es JEFE (para poder confirmar recepciones) e Iván es BOMBERO.
INSERT INTO brigada_miembros (id_brigada, id_persona, rol_en_brigada, fecha_incorporacion, estado)
SELECT b.id_brigada, p.id_persona, 'JEFE_CUADRILLA', CURRENT_DATE, 'ACTIVO'
FROM brigadas b, personas p
WHERE b.nombre = 'Brigada Zorro - Respuesta Rápida'
  AND p.nombres = 'Rosa' AND p.apellidos = 'Campos Vega'
  AND NOT EXISTS (SELECT 1 FROM brigada_miembros bm
                  WHERE bm.id_brigada = b.id_brigada AND bm.id_persona = p.id_persona)
LIMIT 1;

INSERT INTO brigada_miembros (id_brigada, id_persona, rol_en_brigada, fecha_incorporacion, estado)
SELECT b.id_brigada, p.id_persona, 'BOMBERO', CURRENT_DATE, 'ACTIVO'
FROM brigadas b, personas p
WHERE b.nombre = 'Brigada Zorro - Respuesta Rápida'
  AND p.nombres = 'Iván' AND p.apellidos = 'Torres Ruiz'
  AND NOT EXISTS (SELECT 1 FROM brigada_miembros bm
                  WHERE bm.id_brigada = b.id_brigada AND bm.id_persona = p.id_persona)
LIMIT 1;

-- Lince: Elva es BOMBERO (no jefe) -> sirve para probar el 403 al confirmar.
INSERT INTO brigada_miembros (id_brigada, id_persona, rol_en_brigada, fecha_incorporacion, estado)
SELECT b.id_brigada, p.id_persona, 'BOMBERO', CURRENT_DATE, 'ACTIVO'
FROM brigadas b, personas p
WHERE b.nombre = 'Brigada Lince - Alta Montaña'
  AND p.nombres = 'Elva' AND p.apellidos = 'Mamani Quispe'
  AND NOT EXISTS (SELECT 1 FROM brigada_miembros bm
                  WHERE bm.id_brigada = b.id_brigada AND bm.id_persona = p.id_persona)
LIMIT 1;

-- Oso: Néstor quedó INACTIVO -> sirve para probar retirar y volver a añadir.
INSERT INTO brigada_miembros (id_brigada, id_persona, rol_en_brigada, fecha_incorporacion, estado)
SELECT b.id_brigada, p.id_persona, 'JEFE_CUADRILLA', CURRENT_DATE, 'INACTIVO'
FROM brigadas b, personas p
WHERE b.nombre = 'Brigada Oso - Histórica'
  AND p.nombres = 'Néstor' AND p.apellidos = 'Pardo Silva'
  AND NOT EXISTS (SELECT 1 FROM brigada_miembros bm
                  WHERE bm.id_brigada = b.id_brigada AND bm.id_persona = p.id_persona)
LIMIT 1;

-- 5. Una asignación en estado ASIGNADA para probar "Confirmar recepción".
--    Usa el incidente #1 ya existente (no creamos incidentes nuevos).
INSERT INTO incidente_brigadas (id_incidente, id_brigada, fecha_asignacion, estado_asignacion)
SELECT i.id_incidente, b.id_brigada, NOW(), 'ASIGNADA'
FROM incidentes i, brigadas b
WHERE i.id_incidente = 1
  AND b.nombre = 'Brigada Zorro - Respuesta Rápida'
  AND NOT EXISTS (SELECT 1 FROM incidente_brigadas ib
                  WHERE ib.id_incidente = i.id_incidente AND ib.id_brigada = b.id_brigada)
LIMIT 1;

-- =============================================================================
-- LIMPIEZA (descomentar si se quiere borrar solo esta data de prueba)
-- =============================================================================
-- DELETE FROM incidente_brigadas
--  WHERE id_brigada IN (SELECT id_brigada FROM brigadas
--                       WHERE nombre LIKE 'Brigada Zorro%'
--                          OR nombre LIKE 'Brigada Lince%'
--                          OR nombre LIKE 'Brigada Águila%'
--                          OR nombre LIKE 'Brigada Oso%');
-- DELETE FROM brigada_miembros
--  WHERE id_brigada IN (SELECT id_brigada FROM brigadas
--                       WHERE nombre LIKE 'Brigada Zorro%'
--                          OR nombre LIKE 'Brigada Lince%'
--                          OR nombre LIKE 'Brigada Águila%'
--                          OR nombre LIKE 'Brigada Oso%');
-- DELETE FROM brigadas
--  WHERE nombre LIKE 'Brigada Zorro%'
--     OR nombre LIKE 'Brigada Lince%'
--     OR nombre LIKE 'Brigada Águila%'
--     OR nombre LIKE 'Brigada Oso%';
-- DELETE FROM usuarios
--  WHERE nombre_usuario IN ('bombero_rosa','bombero_ivan','bombero_elva',
--                           'bombero_nestor','bombero_dora');
-- DELETE FROM personas
--  WHERE id_persona NOT IN (SELECT id_persona FROM usuarios)
--    AND nombres IN ('Rosa','Iván','Elva','Néstor','Dora');
