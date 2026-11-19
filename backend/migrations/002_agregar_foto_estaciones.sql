-- Migración aditiva: permite guardar la foto de cada estación como data URL.
-- No modifica ni elimina columnas existentes.
ALTER TABLE estaciones ADD COLUMN IF NOT EXISTS foto_url TEXT;
