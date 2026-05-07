# 01. Contexto del Digital Twin

## Qué es el Digital Twin

El Digital Twin (`C:\PACO\workspaces\digital-twin`) es el sistema principal de Paco. Contexto resumido:

- **Stack**: Spring Boot 3.5.6 (Java 21) + React 19 (Vite+TS) + MySQL + MongoDB + OAuth2 Authorization Server propio.
- **Módulos**: dashboards con widgets, alertas, visor 3D xeokit, Electrical Consumers, admin/multi-planta.
- **Estado**: PoC avanzado, no producción. Hay migraciones en curso (MongoDB metrics) y módulos a terminar (EC).
- **OT Gateway**: en modo simulador (no hay acceso al sistema real AVEVA + SCADA todavía).

Para el detalle completo ver `C:\PACO\workspaces\digital-twin\` y los ~40 .md que tiene en `digital-twin-backend/docs/`.

## Qué comparte RTLS Safetrack con el DT

### Compartido (usado literalmente, no duplicado)

**1. Auth Server OAuth2** (`digital-twin-backend/auth-server/`)

El auth-server del DT se reutiliza tal cual. Razones:
- Ya está montado, funcionando y dockerizado.
- Un solo sistema de usuarios para ambos proyectos.
- Federación/SSO natural entre DT y Safetrack.

Pasos para integrar Safetrack:
1. Registrar un cliente nuevo `rtls-safetrack-web` en `oauth2_registered_client` del DT (vía migración Flyway del propio DT, o script SQL manual en PoC).
2. En `positioning-api/application.yml`: `issuer-uri: http://localhost:9000` (el mismo del DT).
3. El JWT firmado por el auth-server es válido en ambos APIs.

**2. Stack técnico (mismas librerías/versiones)**

Idéntico al DT para no generar fricción:
- Spring Boot 3.5.6, Java 21, Spring Security Resource Server, Spring Data JPA + Spring Data MongoDB, Flyway, Spring WebSocket (STOMP).
- React 19, Vite 7, TypeScript, Material-UI 7, Redux Toolkit, React Router 7, axios, i18next, @xeokit/xeokit-sdk 2.6, @stomp/stompjs + sockjs-client.

**3. Código frontend reutilizado (copy-paste literal en Fase 0)**

- `src/context/AuthContext.tsx`
- `src/utils/oauth2.ts`
- `src/services/websocket.ts`
- `src/theme/theme.ts`
- `src/components/Layout/MainLayout.tsx` (adaptación mínima)
- `src/components/PlantSelector/`
- `src/components/ProtectedRoute/`
- `src/components/UserMenu/`
- `src/components/LanguageSelector/`
- `src/i18n/` (config + bases de traducciones)

**4. Código backend reutilizado como plantilla (copy-paste + renombrado)**

- `SecurityConfig.java` → valida JWT, CORS, etc.
- `WebSocketConfig.java` + `JwtHandshakeInterceptor`
- Patrón de `AlertEngineService` → referencia para el zone engine.
- Patrón de `NotificationDispatcherService` + notifiers → referencia para dispatcher de Safetrack (añadiendo canal `HAPTIC_MQTT`).

### No compartido (duplicado)

**1. Bases de datos**

- MySQL: nueva BD `dt_safetrack` (mismo servidor MySQL, puerto 3307, nueva database).
- MongoDB: nueva BD `dt_safetrack_metrics` (misma instancia Mongo, puerto 27016, nueva database).
- Flyway: script propio `V1+` para `dt_safetrack`, no se mezcla con las 69+ migraciones del DT.
- Razón: evitar contaminar el schema del DT mientras el de Safetrack es inestable. Cuando se integre al DT, las tablas se fusionan controladamente (ver `08_INTEGRATION_WITH_DT.md`).

**2. Backend**

- Proyecto Spring Boot propio `positioning-api` en `rtls-safetrack/positioning-api/`.
- Paquete base: `com.lci.rtls.positioning` (en paralelo a `com.lci.dtapi` del DT).
- Puerto propio: 8090 (el DT usa 8080).

**3. Frontend**

- Proyecto React propio `positioning-frontend` en `rtls-safetrack/positioning-frontend/`.
- Puerto propio: 5180 en dev (el DT usa 5173).
- Mismas dependencias que el DT, pero con `package.json` y `vite.config.ts` propios.

**4. Broker MQTT**

- Servicio nuevo (Mosquitto o EMQX) en Docker, propio del proyecto Safetrack.
- Puerto: 1883 (MQTT), 9001 (WebSocket si necesario).
- No interfiere con nada del DT.

**5. docker-compose**

- `rtls-safetrack/dt-safetrack-infra/docker-compose.yml` propio con:
  - Broker MQTT
  - positioning-api
  - positioning-frontend
  - MySQL (o apuntar al mismo del DT, decisión en Fase 0)
  - MongoDB (o apuntar al mismo del DT, decisión en Fase 0)
- El auth-server del DT se asume **ya corriendo** (dependencia externa).

## Por qué estas decisiones

### Por qué compartir auth-server y no duplicar

- Un único sistema de identidad es lo correcto funcionalmente: el mismo trabajador (si es también usuario del sistema) no debería tener dos cuentas.
- El auth-server es estable, maduro, dockerizado. Duplicarlo sería trabajo estéril.
- Registrar un cliente OAuth2 más en la tabla `oauth2_registered_client` es una operación trivial.

### Por qué duplicar DBs y no compartir

- El schema del DT está en evolución (hay migraciones activas). Mezclar Flyway de dos proyectos genera conflictos de versión.
- Las tablas de Safetrack (workers, tags, zones, proximity events) son conceptualmente independientes del dominio del DT.
- En PoC se cambia schema con frecuencia; mejor no tocar la BD del DT.
- Cuando se integre al DT (Q3 2026), se hará un merge controlado.

### Por qué duplicar backend y frontend

- El DT ya es grande (25+ controllers, 47+ services, 11+ slices Redux). Añadir 5-10 controllers más sin haber validado el diseño es contaminar.
- En proyecto aparte, Paco (y cualquiera) puede trabajar en paralelo sin tocar el DT.
- La integración posterior será mover `com.lci.rtls.positioning.*` → `com.lci.dtapi.positioning.*` y `src/pages/*` del frontend Safetrack → `src/modules/positioning/` del frontend DT. Es mecánico.

## Plan futuro de integración

Ver detalle en `08_INTEGRATION_WITH_DT.md`. Resumen: cuando PoC esté validada, merge controlado en ~2 semanas.
