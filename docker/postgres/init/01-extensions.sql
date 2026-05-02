-- Extensiones requeridas por el schema Smash.
-- Se ejecuta automáticamente la primera vez que se crea el volumen postgres-data.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- búsqueda fuzzy en clientes/productos
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- normalización de tildes

-- Zona horaria por defecto a nivel servidor
ALTER DATABASE smash SET timezone TO 'America/Asuncion';
