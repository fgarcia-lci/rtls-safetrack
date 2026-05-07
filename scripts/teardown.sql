-- =============================================================================
-- RTLS Safetrack — Teardown / Rollback completo (MySQL)
--
-- Revierte TODO lo que Safetrack hizo en MySQL, dejando el Digital Twin
-- intacto.
--
-- Uso:
--   mysql -h localhost -P 3307 -u dt_root -pdtroot < scripts/teardown.sql
--
-- Para Mongo, ejecutar también: scripts/teardown-mongo.js
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Borrar la BD propia de Safetrack (todas las tablas pos_* y los datos)
-- -----------------------------------------------------------------------------
DROP DATABASE IF EXISTS dt_safetrack;

-- -----------------------------------------------------------------------------
-- 2. Eliminar el cliente OAuth2 que añadimos al auth-server del DT
--    (es la ÚNICA fila que Safetrack añadió en la BD del DT)
-- -----------------------------------------------------------------------------
USE dt_lci;

-- Si hay autorizaciones activas (tokens emitidos), las borramos primero
-- aunque la FK ya tiene ON DELETE CASCADE — lo hacemos explícito para claridad
DELETE FROM oauth2_authorization
 WHERE registered_client_id = 'rtls-safetrack-web-client-id';

DELETE FROM oauth2_authorization_consent
 WHERE registered_client_id = 'rtls-safetrack-web-client-id';

DELETE FROM oauth2_registered_client
 WHERE client_id = 'rtls-safetrack-web';

-- -----------------------------------------------------------------------------
-- Verificación: NO debería quedar rastro de Safetrack
-- -----------------------------------------------------------------------------
SELECT 'Bases de datos restantes (no debería estar dt_safetrack):' AS check_label;
SHOW DATABASES LIKE '%safetrack%';

SELECT 'Clientes OAuth2 restantes (no debería estar rtls-safetrack-web):' AS check_label;
SELECT client_id FROM oauth2_registered_client WHERE client_id LIKE '%safetrack%';

-- Si las dos consultas anteriores devuelven 0 filas, el rollback de MySQL ha terminado.
