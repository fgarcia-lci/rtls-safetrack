# Rollback — cómo desinstalar RTLS Safetrack sin afectar al Digital Twin

Si el cliente rechaza la PoC y hay que retirar todo, este documento define cómo dejar el Digital Twin **exactamente igual que estaba** antes de empezar.

## Lo que Safetrack toca del DT

Lista exhaustiva (auditada). Solo hay **una** modificación en la BD del DT:

| Recurso | Tipo de modificación | Reversible con |
|---|---|---|
| `dt_lci.oauth2_registered_client` (1 fila: `client_id='rtls-safetrack-web'`) | INSERT | `scripts/teardown.sql` |
| `dt_lci.oauth2_authorization` (filas con `registered_client_id='rtls-safetrack-web-client-id'`, generadas en uso) | INSERT en runtime | `scripts/teardown.sql` (cascade implícito) |
| `dt_lci.oauth2_authorization_consent` (idem) | INSERT en runtime | `scripts/teardown.sql` (cascade implícito) |

**Cero cambios** en cualquier otra tabla del DT. **Cero cambios de schema** del DT (no añadimos columnas a sus tablas, no modificamos índices, no alteramos FKs).

## Lo que Safetrack tiene en BDs propias (se borra entero)

| BD | Contenido |
|---|---|
| `dt_safetrack` (MySQL, mismo servidor que DT) | 11 tablas `pos_*` con todos los datos |
| `dt_safetrack_metrics` (MongoDB, misma instancia que DT) | Colecciones `tag_positions_current/5min/hourly/daily` y similares |

Estas dos BDs son **propiedad exclusiva de Safetrack**. El Digital Twin no las conoce ni las consulta.

## Procedimiento de rollback

### 1. Parar los servicios de Safetrack

```bash
# En el servidor on-premise:
cd /ruta/a/rtls-safetrack/infra
docker compose down -v   # Para Mosquitto y borra volúmenes locales

# Si el positioning-api o el frontend están corriendo en host:
# parar los procesos Maven (Ctrl+C) y Vite (Ctrl+C).
```

### 2. Rollback MySQL

```bash
mysql -h localhost -P 3307 -u dt_root -pdtroot < scripts/teardown.sql
```

Lo que hace:
1. `DROP DATABASE dt_safetrack` (se va con todas las tablas y datos).
2. Borra las filas `oauth2_authorization` y `oauth2_authorization_consent` con `registered_client_id='rtls-safetrack-web-client-id'`.
3. Borra la fila `oauth2_registered_client` con `client_id='rtls-safetrack-web'`.
4. Imprime verificación final.

### 3. Rollback MongoDB

```bash
mongosh "mongodb://dt_root:dtroot@localhost:27016/admin?authSource=admin" scripts/teardown-mongo.js
```

Lo que hace:
1. `db.dropDatabase()` sobre `dt_safetrack_metrics`.
2. `revokeRolesFromUser` quita el grant `readWrite@dt_safetrack_metrics` del usuario `dt_app`.
3. Imprime verificación final.

### 4. Borrar artefactos de despliegue

```bash
rm -rf /ruta/a/rtls-safetrack
docker volume prune              # opcional: limpia volúmenes huérfanos
docker image rm eclipse-mosquitto:2   # opcional
```

## Cómo verificar que el DT está intacto

Después del rollback, ejecuta estas checks contra la BD del DT:

```sql
-- 1. No debería haber BDs con 'safetrack' en el nombre
SHOW DATABASES LIKE '%safetrack%';
-- Esperado: 0 filas

-- 2. No debería haber clientes OAuth2 con 'safetrack' en el nombre
SELECT client_id FROM dt_lci.oauth2_registered_client WHERE client_id LIKE '%safetrack%';
-- Esperado: 0 filas

-- 3. El DT debería seguir teniendo su cliente y arrancar normal
SELECT client_id FROM dt_lci.oauth2_registered_client WHERE client_id = 'dt-web';
-- Esperado: 1 fila

-- 4. La BD dt_lci sigue intacta
SELECT COUNT(*) FROM dt_lci.users;
SELECT COUNT(*) FROM dt_lci.plants;
-- Esperado: los mismos counts que antes de instalar Safetrack
```

```bash
# 5. El auth-server del DT sigue arrancando
curl -s http://localhost:9000/.well-known/openid-configuration | jq .issuer
# Esperado: "http://localhost:9000"

# 6. El api del DT sigue respondiendo
curl -s http://localhost:8080/api/management/health
# Esperado: {"status":"UP"}

# 7. El frontend del DT sigue cargando en :5173
```

## Por qué este rollback es seguro

- **No modificamos schema del DT**: ningún `ALTER TABLE`, ningún `ADD COLUMN`, ningún índice añadido.
- **No tenemos FKs reales hacia tablas del DT**: nuestras referencias son soft FKs (UUID en VARCHAR, sin `FOREIGN KEY`). Por eso `DROP DATABASE dt_safetrack` no rompe nada en el DT.
- **No compartimos tablas**: cada proyecto tiene las suyas. No hay riesgo de borrar datos del DT por accidente.
- **Las migraciones Flyway de Safetrack están en su propia BD**: `dt_safetrack.flyway_schema_history`, separada de `dt_lci.flyway_schema_history`. Borrar `dt_safetrack` no afecta el historial Flyway del DT.

## Si en su lugar la PoC SÍ se aprueba

Ver `08_INTEGRATION_WITH_DT.md` para el plan de integración (mover paquetes Java, fusionar Flyway, mover datos a `dt_lci` y `dt_metrics`). El trabajo estimado es medio día, gracias a que durante la PoC mantuvimos:
- Tipos de columnas idénticos al DT (las soft FKs ya están en formato correcto).
- Convenciones de naming idénticas (snake_case, plural, `created_at/by`, `is_active`).
- Cero divergencia conceptual con tablas del DT (no duplicamos `users`, `plants`, etc.).
