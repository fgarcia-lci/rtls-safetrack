-- =============================================================================
-- RTLS Safetrack — Registro del cliente OAuth2 `rtls-safetrack-web`
--
-- Inserta una fila en `dt_lci.oauth2_registered_client` para que el frontend
-- de Safetrack pueda autenticarse contra el auth-server del DT (puerto 9000)
-- usando Authorization Code Flow + PKCE (cliente público, sin client_secret).
--
-- IDEMPOTENTE: si la fila ya existe, INSERT IGNORE no hace nada.
--
-- Uso:
--   mysql -h localhost -P 3307 -u dt_root -pdtroot dt_lci < scripts/register-oauth2-client.sql
--
-- Nota: este es el ÚNICO cambio que Safetrack hace en la BD del DT.
-- Para revertirlo, ver scripts/teardown.sql.
-- =============================================================================

INSERT IGNORE INTO oauth2_registered_client (
    id,
    client_id,
    client_id_issued_at,
    client_secret,
    client_secret_expires_at,
    client_name,
    client_authentication_methods,
    authorization_grant_types,
    redirect_uris,
    post_logout_redirect_uris,
    scopes,
    client_settings,
    token_settings
) VALUES (
    'rtls-safetrack-web-client-id',
    'rtls-safetrack-web',
    CURRENT_TIMESTAMP,
    NULL,                                                    -- Public client (PKCE, sin secret)
    NULL,
    'RTLS Safetrack Web Application',
    'none',                                                  -- Public client authentication
    'authorization_code,refresh_token',
    'http://localhost:5180/callback',
    'http://localhost:5180',
    'openid,offline_access,read,write',
    '{"@class":"java.util.Collections$UnmodifiableMap","settings.client.require-proof-key":true,"settings.client.require-authorization-consent":false}',
    '{"@class":"java.util.Collections$UnmodifiableMap","settings.token.reuse-refresh-tokens":true,"settings.token.id-token-signature-algorithm":["org.springframework.security.oauth2.jose.jws.SignatureAlgorithm","RS256"],"settings.token.access-token-time-to-live":["java.time.Duration",3600.000000000],"settings.token.access-token-format":{"@class":"org.springframework.security.oauth2.server.authorization.settings.OAuth2TokenFormat","value":"self-contained"},"settings.token.refresh-token-time-to-live":["java.time.Duration",86400.000000000],"settings.token.authorization-code-time-to-live":["java.time.Duration",300.000000000],"settings.token.device-code-time-to-live":["java.time.Duration",300.000000000]}'
);

-- Verificación
SELECT id, client_id, client_name, redirect_uris
  FROM oauth2_registered_client
 WHERE client_id = 'rtls-safetrack-web';
