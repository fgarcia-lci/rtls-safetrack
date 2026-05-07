-- =============================================================================
-- RTLS Safetrack — Setup inicial de bases de datos
--
-- Ejecutar UNA VEZ antes del primer arranque del positioning-api.
-- Se conecta a las MISMAS instancias MySQL/MongoDB que usa el Digital Twin
-- (puertos 3307 y 27016 respectivamente), creando las BDs propias de Safetrack.
--
-- IMPORTANTE: este script debe ejecutarse como el usuario `root` real de MySQL
-- (NO con el usuario `dt_root`, que solo tiene grants sobre dt_lci).
--
-- Uso vía Docker (recomendado, sin instalar mysql cliente en Windows):
--   Get-Content scripts\setup-databases.sql | docker exec -i dt-infra-mysql-1 mysql -u root -pdtroot
--
-- En PoC reutilizamos al usuario `dt_root` para la app — solo le añadimos grants
-- sobre la nueva BD `dt_safetrack`. En producción, crear un usuario dedicado
-- `rts_app` con permisos solo sobre dt_safetrack.
--
-- Para MongoDB ver la sección al final.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. MySQL: BD `dt_safetrack` para config, workers, tags, zonas, eventos
-- -----------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS dt_safetrack
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- Dar al usuario de aplicación `dt_root` permisos completos sobre la nueva BD.
-- (Sigue teniendo sus permisos originales sobre dt_lci.)
GRANT ALL PRIVILEGES ON dt_safetrack.* TO 'dt_root'@'%';
FLUSH PRIVILEGES;

-- Verificación:
SHOW DATABASES LIKE 'dt_safetrack';
SHOW GRANTS FOR 'dt_root'@'%';

-- =============================================================================
-- 2. MongoDB: BD `dt_safetrack_metrics` (tag_positions_*)
-- =============================================================================
--
-- MongoDB crea la BD automáticamente al primer write, pero el usuario
-- `dt_app` que ya usa el DT necesita permisos sobre la nueva BD.
--
-- Forma recomendada (vía Docker, una sola línea):
--
--   docker exec dt-infra-mongodb-1 mongosh "mongodb://mongoadmin:mongoadmin123@localhost:27017/admin?authSource=admin" --quiet --eval "db.getSiblingDB('dt_metrics').grantRolesToUser('dt_app', [{role:'readWrite', db:'dt_safetrack_metrics'}])"
--
-- Notas:
-- - mongoadmin/mongoadmin123 son las credenciales del root de Mongo del DT
--   (variables MONGO_INITDB_ROOT_USERNAME/PASSWORD del contenedor).
-- - El usuario `dt_app` está creado en la BD `dt_metrics`, NO en `admin`.
--   Por eso `getSiblingDB('dt_metrics')` y por eso el `application.yml` del
--   positioning-api conecta con `authSource=dt_metrics`.
--
-- Verificación:
--   use dt_safetrack_metrics
--   db.runCommand({ connectionStatus: 1 })
--
-- (En producción, crear usuario dedicado `rts_app` con permisos solo sobre
-- esta BD; en PoC reutilizamos `dt_app` para no liarnos.)

-- =============================================================================
-- 3. Cliente OAuth2 `rtls-safetrack-web` en el auth-server del DT
-- =============================================================================
--
-- Eso lo hace `scripts/register-oauth2-client.sql` (a generar en tarea siguiente).
