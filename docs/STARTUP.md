# Cómo arrancar RTLS Safetrack en local

Guía paso a paso para levantar el sistema completo desde cero. **Asume Windows + Docker Desktop + PowerShell**. Para Linux/Mac los comandos son equivalentes salvo notas concretas.

> **Histórico**: este documento se actualizó tras el primer arranque end-to-end (sesión 2026-04-28). Recoge troubleshoots reales que encontramos y cómo evitarlos.

## Prerrequisitos

- **Docker Desktop** corriendo.
- **Java 21** instalado (Temurin/Adoptium recomendado). El proyecto trae Maven Wrapper, no hace falta instalar Maven.
- **Node 20+** y **npm** (para el frontend).
- **Digital Twin corriendo**: levantar primero con `docker compose up -d` desde `C:\PACO\workspaces\digital-twin\dt-infra`.

> **NO necesitas** los clientes `mysql.exe` ni `mongosh` instalados en Windows — todo se ejecuta dentro de los contenedores del DT vía `docker exec`.

### Verificar prerrequisitos

```powershell
# Java 21 instalado
java -version
# Esperado: openjdk version "21.x.x"

# JAVA_HOME apunta a la carpeta del JDK (NO al .exe)
$env:JAVA_HOME
# Esperado: algo como "C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot"
# Si está mal o vacío, ver troubleshoot abajo

# Contenedores del DT corriendo
docker ps --format "table {{.Names}}`t{{.Ports}}"
# Esperado ver:
#   dt-infra-mysql-1        ...:3307->3306/tcp
#   dt-infra-mongodb-1      ...:27016->27017/tcp
#   dt-infra-auth-server-1  ...:9000->9000/tcp
#   dt-infra-digital-twin-api-1   ...:8080->8080/tcp
#   dt-infra-frontend-1     ...:5173->5173/tcp
```

## Setup inicial — del DT (UNA SOLA VEZ, primera vez de toda la vida)

Este paso modifica el auth-server del DT para que acepte CORS desde nuestro frontend `:5180`. **Solo necesario la primera vez** (o si te traes el DT desde un repo limpio).

> Ya está hecho en este checkout — incluye:
> - `digital-twin-backend/auth-server/src/main/java/com/lci/auth/config/SecurityConfig.java` con multi-origen.
> - `digital-twin/dt-infra/docker-compose.yml` con `FRONTEND_URL: "http://localhost:5173,http://localhost:5180"`.

Tras esos cambios, una vez:

```powershell
cd C:\PACO\workspaces\digital-twin\dt-infra
docker compose build auth-server
docker compose up -d auth-server
```

Verifica que la nueva env var llegó:
```powershell
docker exec dt-infra-auth-server-1 env | findstr FRONTEND_URL
# Esperado: FRONTEND_URL=http://localhost:5173,http://localhost:5180
```

## Setup inicial — de Safetrack (UNA SOLA VEZ por máquina)

```powershell
cd C:\PACO\workspaces\rtls-safetrack
```

### 1. Crear la BD `dt_safetrack` en MySQL

**IMPORTANTE**: este script debe ejecutarse como **`root` real**, no como `dt_root` (que solo tiene permisos sobre `dt_lci`).

```powershell
Get-Content scripts\setup-databases.sql | docker exec -i dt-infra-mysql-1 mysql -u root -pdtroot
```

El script crea la BD `dt_safetrack` y otorga `ALL PRIVILEGES` al usuario `dt_root` sobre ella.

**Verifica**:
```powershell
docker exec dt-infra-mysql-1 mysql -u dt_root -pdtroot -e "SHOW DATABASES LIKE 'dt_safetrack';"
# Esperado: 1 fila con 'dt_safetrack'
```

### 2. Permisos a `dt_app` sobre la BD Mongo `dt_safetrack_metrics`

**IMPORTANTE**: el usuario `dt_app` está autenticado contra la BD `dt_metrics` (no contra `admin`). Por eso el grant se hace con `getSiblingDB('dt_metrics')`. Por la misma razón, en `application.yml` la URI de Mongo lleva `authSource=dt_metrics`.

```powershell
docker exec dt-infra-mongodb-1 mongosh "mongodb://mongoadmin:mongoadmin123@localhost:27017/admin?authSource=admin" --quiet --eval "db.getSiblingDB('dt_metrics').grantRolesToUser('dt_app', [{role:'readWrite', db:'dt_safetrack_metrics'}])"
```

(Las credenciales `mongoadmin/mongoadmin123` son las del root de Mongo del DT, definidas en su docker-compose.)

**Verifica**:
```powershell
docker exec dt-infra-mongodb-1 mongosh "mongodb://mongoadmin:mongoadmin123@localhost:27017/admin?authSource=admin" --quiet --eval "db.getSiblingDB('dt_metrics').getUser('dt_app')"
# Esperado: en `roles` debe aparecer { role: 'readWrite', db: 'dt_safetrack_metrics' }
```

### 3. Registrar el cliente OAuth2 `rtls-safetrack-web` en el auth-server del DT

Esto sí usa `dt_root` (porque escribe en `dt_lci`, donde sí tiene permisos):

```powershell
Get-Content scripts\register-oauth2-client.sql | docker exec -i dt-infra-mysql-1 mysql -u dt_root -pdtroot dt_lci
```

El script es idempotente (`INSERT IGNORE`).

**Verifica**:
```powershell
docker exec dt-infra-mysql-1 mysql -u dt_root -pdtroot dt_lci -e "SELECT client_id, client_name FROM oauth2_registered_client WHERE client_id='rtls-safetrack-web';"
# Esperado: 1 fila con rtls-safetrack-web | RTLS Safetrack Web Application
```

## Arranque diario

### 1. Comprobar que el Digital Twin está corriendo

```powershell
docker ps --filter "name=dt-infra-auth-server-1"
# Si no aparece:
#   cd C:\PACO\workspaces\digital-twin\dt-infra
#   docker compose up -d
```

### 2. Arrancar el broker MQTT (Mosquitto)

```powershell
cd C:\PACO\workspaces\rtls-safetrack\infra
docker compose up -d
docker ps --filter "name=rts-mosquitto"
# Esperado: rts-mosquitto Up
```

### 3. Arrancar el `positioning-api`

**Si JAVA_HOME no está bien configurado** (apunta a una versión vieja o al `.exe`), arréglalo solo para esta sesión:

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot"
# Ajusta el path al de tu instalación. Debe ser la CARPETA del JDK, NO el .exe.
```

Para arreglarlo permanentemente:
```powershell
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot", "User")
# Cierra y reabre PowerShell para que lo coja.
```

Y arranca:
```powershell
cd C:\PACO\workspaces\rtls-safetrack\positioning-api
.\mvnw.cmd spring-boot:run
```

La **primera vez tarda 1-2 minutos** descargando Maven y dependencias. Logs esperados:

```
... Flyway Community Edition ... by Redgate
... Migrating schema `dt_safetrack` to version "1 - init schema"
... Successfully applied 1 migration to schema `dt_safetrack`
... Tomcat started on port 8090 (http) with context path '/api'
... Started PositioningApiApplication in N seconds
```

### 4. Arrancar el `positioning-frontend`

En **otra ventana** de PowerShell:

```powershell
cd C:\PACO\workspaces\rtls-safetrack\positioning-frontend
npm install   # solo la primera vez, tarda 1-2 min
npm run dev
```

Abre `http://localhost:5180` en el navegador. Te redirige al login del DT (`:9000/login`), te autenticas con tus credenciales del DT, vuelve a `:5180/callback` y aterrizas en el dashboard de RTLS Safetrack.

## Verificación end-to-end

```powershell
# Health del api
curl.exe -s http://localhost:8090/api/management/health
# Esperado: {"status":"UP"}

# Las 11 tablas pos_* + flyway_schema_history (= 12 filas)
docker exec dt-infra-mysql-1 mysql -u dt_root -pdtroot dt_safetrack -e "SHOW TABLES;"

# El seed inicial: planta TSP3 + vista del XKT
docker exec dt-infra-mysql-1 mysql -u dt_root -pdtroot dt_safetrack -e "SELECT plant_id FROM pos_plant_settings; SELECT code, asset_url FROM pos_plant_views;"

# Endpoint protegido sin token → 401
curl.exe -s -o NUL -w "Status: %{http_code}`n" http://localhost:8090/api/v1/workers
# Esperado: Status: 401

# Auth-server responde
curl.exe -s http://localhost:9000/.well-known/openid-configuration
# Esperado: JSON con "issuer": "http://localhost:9000"

# Broker MQTT alcanzable (puerto 1883 = INTERNO del contenedor; mapeado a 1884 en host)
docker exec rts-mosquitto mosquitto_pub -h localhost -p 1883 -t test -m "hola"
# Sin errores: OK
# Desde el host (fuera de docker) usaríamos: mosquitto_pub -h localhost -p 1884 -t test -m "hola"
```

## Troubleshooting

### `The '<' operator is reserved for future use` en PowerShell
PowerShell no soporta la redirección bash `<`. Usa pipe con `Get-Content`:
```powershell
Get-Content scripts\setup-databases.sql | docker exec -i dt-infra-mysql-1 mysql -u root -pdtroot
```

### `Access denied for user 'dt_root'@'%' to database 'dt_safetrack'`
Estás ejecutando un script con `dt_root` pero la BD aún no le ha dado grants. **Ejecuta `setup-databases.sql` con `root` real** (no `dt_root`):
```powershell
Get-Content scripts\setup-databases.sql | docker exec -i dt-infra-mysql-1 mysql -u root -pdtroot
```

### `MongoServerError: Could not find user "dt_app" for db "admin"`
El usuario `dt_app` vive en `dt_metrics`, no en `admin`. El comando correcto:
```powershell
docker exec dt-infra-mongodb-1 mongosh "mongodb://mongoadmin:mongoadmin123@localhost:27017/admin?authSource=admin" --quiet --eval "db.getSiblingDB('dt_metrics').grantRolesToUser('dt_app', [{role:'readWrite', db:'dt_safetrack_metrics'}])"
```

### `JAVA_HOME environment variable is not defined correctly`
- Localiza Java actual: `where.exe java`. Te debería dar algo como `C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot\bin\java.exe`.
- JAVA_HOME tiene que ser la **carpeta**, sin `\bin\java.exe`:
  ```powershell
  $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot"
  ```

### Flyway falla con `Expression of generated column 'duration_sec' contains a disallowed function: now`
Era un bug en `V1__init_schema.sql` ya corregido — la columna ahora solo computa duración cuando `exited_at` es NOT NULL. Si te aparece, es que tienes una versión vieja del repo. Asegúrate de pull del último V1 y limpia la BD:
```powershell
docker exec dt-infra-mysql-1 mysql -u root -pdtroot -e "DROP DATABASE IF EXISTS dt_safetrack;"
Get-Content scripts\setup-databases.sql | docker exec -i dt-infra-mysql-1 mysql -u root -pdtroot
```

Y reintenta el arranque del api.

### Login en `:5180` da error de CORS: `Access to fetch at 'http://localhost:9000/oauth2/token' has been blocked by CORS policy`
El auth-server del DT solo está aceptando `:5173`. Necesitas el setup multi-origen:
1. Verifica en `digital-twin-backend/auth-server/src/main/java/com/lci/auth/config/SecurityConfig.java` que la línea de `setAllowedOrigins` haga split por coma.
2. Verifica en `digital-twin/dt-infra/docker-compose.yml` que el servicio `auth-server` tenga env var `FRONTEND_URL: "http://localhost:5173,http://localhost:5180"`.
3. Reconstruye y reinicia el auth-server:
   ```powershell
   cd C:\PACO\workspaces\digital-twin\dt-infra
   docker compose build auth-server
   docker compose up -d auth-server
   ```
4. **Limpia el localStorage** del navegador en `localhost:5180` (DevTools → Application → Local Storage → Clear) — si no, queda state de PKCE que entra en bucle.

### Bucle infinito en el callback (`Error de Autenticación` → `/login` → callback de nuevo)
Estado huérfano de PKCE en localStorage. Cierra la pestaña, limpia localStorage de `:5180` y vuelve a abrir.

### El api arranca pero el login devuelve `invalid_client`
No has registrado el cliente OAuth2. Ejecuta el paso 3 del setup inicial.

### `Unknown database 'dt_safetrack'` al arrancar el api
No has ejecutado `setup-databases.sql`. Vuelve al paso 1.

### El `positioning-frontend` no arranca: puerto 5180 ocupado
Ya hay otra instancia corriendo. Localiza el proceso y mátalo:
```powershell
Get-NetTCPConnection -LocalPort 5180 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

### Quiero rearrancar todo desde cero (sin perder nada del DT)
Ver `docs/ROLLBACK.md`. Borra solo lo nuestro y vuelve a ejecutar el setup inicial.

## Variables de entorno (opcional, para sobrescribir defaults)

Todas tienen un default razonable en `application.yml`. Solo definir si necesitas cambiar.

| Variable | Default | Para qué |
|---|---|---|
| `DB_URL` | `jdbc:mysql://localhost:3307/dt_safetrack...` | URL JDBC |
| `DB_USERNAME` | `dt_root` | usuario MySQL |
| `DB_PASSWORD` | `dtroot` | password MySQL |
| `MONGO_URI` | `mongodb://dt_app:...@localhost:27016/dt_safetrack_metrics?authSource=dt_metrics` | URI Mongo (ojo `authSource=dt_metrics`) |
| `AUTH_ISSUER` | `http://localhost:9000` | issuer JWT (auth-server del DT) |
| `MQTT_BROKER_URL` | `tcp://localhost:1884` | URL del broker (1884 en host porque otro Mosquitto ocupa 1883) |
| `MQTT_USERNAME` | (vacío) | user MQTT |
| `MQTT_PASSWORD` | (vacío) | password MQTT |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5180` | orígenes permitidos por CORS del api |
| `WS_ALLOWED_ORIGINS` | `http://localhost:*` | orígenes permitidos por WebSocket del api |

## Para parar todo

```powershell
# api: Ctrl+C en la ventana donde corre .\mvnw.cmd spring-boot:run
# frontend: Ctrl+C en la ventana donde corre npm run dev

# Mosquitto:
cd C:\PACO\workspaces\rtls-safetrack\infra
docker compose down

# (NO tocar el docker-compose del DT, déjalo corriendo si lo usas para otras cosas.)
```

## Resumen mínimo (cheat sheet)

Setup inicial ejecutado una vez. Para arranque diario después:

```powershell
# Asumiendo el DT corriendo y JAVA_HOME bien configurado a nivel User

# Ventana 1: Mosquitto
cd C:\PACO\workspaces\rtls-safetrack\infra ; docker compose up -d

# Ventana 1 (sigue): api
cd C:\PACO\workspaces\rtls-safetrack\positioning-api ; .\mvnw.cmd spring-boot:run

# Ventana 2: frontend
cd C:\PACO\workspaces\rtls-safetrack\positioning-frontend ; npm run dev

# Browser: http://localhost:5180
```
