-- =============================================================================
-- DATOS INICIALES DE PRUEBA (SEEDS)
-- Sistema de Gestión de Incendios Forestales
-- =============================================================================

-- 1. Roles
INSERT INTO roles (nombre_rol, descripcion) VALUES
('ADMINISTRADOR', 'Control total del sistema, gestión de estaciones, recursos y reportes'),
('OPERADOR', 'Operador de central, recepción de avisos y gestión de incidentes'),
('BOMBERO', 'Personal operativo en campo y jefes de cuadrilla'),
('CIUDADANO', 'Usuario público que reporta avisos de incendios y recibe alertas')
ON CONFLICT (nombre_rol) DO NOTHING;

-- 2. Personas
INSERT INTO personas (nombres, apellidos, telefono, direccion, tipo_persona) VALUES
('Carlos', 'Mendoza Arce', '77123456', 'Av. Las Palmas #123, Central', 'ADMINISTRADOR'),
('Lucía', 'Fernández Ramos', '77234567', 'Calle Murillo #450, Zona Norte', 'OPERADOR'),
('Jorge', 'Salazar Gutiérrez', '77345678', 'Av. 6 de Agosto #789, Miraflores', 'BOMBERO'),
('Mario', 'Vargas Peñaranda', '77456789', 'Calle Sucre #234, San Pedro', 'BOMBERO'),
('Ana', 'Roca Beltrán', '77567890', 'Av. Ballivián #567, Calacoto', 'CIUDADANO');

-- 3. Usuarios
-- Nota: En producción usar hashes reales (bcrypt/argon2); estos son ejemplos para pruebas
INSERT INTO usuarios (id_persona, id_rol, nombre_usuario, hash_contrasena, estado) VALUES
(1, 1, 'admin', 'scrypt:32768:8:1$admin123$hash_placeholder', 'ACTIVO'),
(2, 2, 'operador1', 'scrypt:32768:8:1$operador123$hash_placeholder', 'ACTIVO'),
(3, 3, 'bombero_jorge', 'scrypt:32768:8:1$bombero123$hash_placeholder', 'ACTIVO'),
(4, 3, 'bombero_mario', 'scrypt:32768:8:1$bombero123$hash_placeholder', 'ACTIVO'),
(5, 4, 'ciudadano_ana', 'scrypt:32768:8:1$ciudadano123$hash_placeholder', 'ACTIVO')
ON CONFLICT (nombre_usuario) DO NOTHING;

-- 4. Zonas de Riesgo
INSERT INTO zonas_riesgo (nombre, ubicacion, nivel_riesgo, descripcion, id_administrador) VALUES
('Parque Nacional Tunari - Sector A', 'Coord: -17.3125, -66.1842', 'ALTO', 'Zona de bosque de pinos y eucaliptos con alta pendiente', 1),
('Cordillera Oriental - Valle Alto', 'Coord: -17.5241, -65.9812', 'MEDIO', 'Pajonales y matorrales secos', 1),
('Reserva Forestal Serranía', 'Coord: -17.2054, -66.3011', 'EXTREMO', 'Pastizales densos cercanos a comunidades', 1);

-- 5. Estaciones
INSERT INTO estaciones (nombre, direccion, telefono, id_administrador) VALUES
('Estación Central de Bomberos #1', 'Av. Circunvalación esq. Av. América', '4421111', 1),
('Sub-estación Valle Norte #2', 'Carretera al Norte Km 8', '4432222', 1);

-- 6. Unidades (Vehículos)
INSERT INTO unidades (codigo, tipo, capacidad, estado, motivo_estado, id_estacion, id_administrador) VALUES
('B-101', 'Autobomba Pesada', '4000 Litros de agua', 'DISPONIBLE', 'Operativa con mantenimiento al día', 1, 1),
('C-201', 'Cisterna de Apoyo', '10000 Litros de agua', 'DISPONIBLE', 'Lista para abastecimiento', 1, 1),
('R-301', 'Vehículo Rápido 4x4', '4 rescatistas + 500L', 'DISPONIBLE', 'En patrullaje preventivo', 2, 1)
ON CONFLICT (codigo) DO NOTHING;

-- 7. Recursos (NUEVA ENTIDAD RECURSO)
-- Tipos: 'equipo', 'herramienta', 'insumo'
INSERT INTO recursos (nombre, tipo_recurso, cantidad, estado, motivo_estado, id_estacion, id_administrador) VALUES
('Mochila Aspersora 20L', 'equipo', 25, 'DISPONIBLE', 'Cargadas y revisadas', 1, 1),
('Matafuegos / Batefuegos Forestal', 'herramienta', 40, 'DISPONIBLE', 'Herramientas manuales afiladas', 1, 1),
('Motosierra Stihl MS 381', 'equipo', 6, 'DISPONIBLE', 'Con cadena de repuesto y aceite', 1, 1),
('Retardante Químico de Fuego (Bidón 20L)', 'insumo', 50, 'DISPONIBLE', 'En almacén seco', 1, 1),
('Rastrillo McLeod', 'herramienta', 30, 'DISPONIBLE', 'Excelente estado para líneas de defensa', 2, 1),
('Pulaski (Hacha-Azadón)', 'herramienta', 20, 'DISPONIBLE', 'Inspeccionadas', 2, 1),
('Botiquín de Trauma Forestal', 'insumo', 15, 'DISPONIBLE', 'Completos con vendas y apósitos de quemaduras', 1, 1);

-- 8. Brigadas
INSERT INTO brigadas (nombre, estado, motivo_estado, id_estacion) VALUES
('Brigada Puma - Cuadrilla Forestal 1', 'ACTIVA', 'Personal completo y preparado', 1),
('Brigada Cóndor - Ataque Rápido', 'ACTIVA', 'Guardia diurna', 2);

-- 9. Miembros de Brigada
INSERT INTO brigada_miembros (id_brigada, id_persona, rol_en_brigada, estado) VALUES
(1, 3, 'JEFE_CUADRILLA', 'ACTIVO'),
(1, 4, 'BOMBERO', 'ACTIVO')
ON CONFLICT (id_brigada, id_persona) DO NOTHING;

-- 10. Tipos de Alerta
INSERT INTO tipos_alerta (nombre, plantilla_mensaje) VALUES
('ALERTA ROJA - EVACUACIÓN', 'URGENTE: Incendio descontrolado avanzando hacia {zona}. Evacúe inmediatamente hacia {refugio}.'),
('ALERTA AMARILLA - PREVENCIÓN', 'PRECAUCIÓN: Foco de calor detectado en {zona}. Evite realizar chaqueos o encender fogatas.'),
('ALERTA VERDE - CONTROLADO', 'AVISO: El incendio en {zona} ha sido contenido y liquidado por las cuadrillas de bomberos.')
ON CONFLICT (nombre) DO NOTHING;

-- 11. Avisos de Incendio
INSERT INTO avisos_incendio (id_ciudadano, ubicacion, descripcion, nivel_urgencia, estado_aviso) VALUES
(5, 'Cerro San Pedro, cara este', 'Humo blanco y luego negro saliendo de los matorrales', 'ALTO', 'VERIFICADO');

-- 12. Incidentes
INSERT INTO incidentes (id_aviso, id_operador, id_zona, ubicacion, gravedad, estado) VALUES
(1, 2, 1, 'Sector Tunari Km 5', 'ALTA', 'ACTIVO');

-- 13. Asignación de Brigada a Incidente
INSERT INTO incidente_brigadas (id_incidente, id_brigada, estado_asignacion) VALUES
(1, 1, 'EN_SITIO');
