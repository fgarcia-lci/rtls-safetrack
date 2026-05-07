# RTLS Safetrack — Contexto para Claude

Proyecto hermano del Digital Twin (`C:\PACO\workspaces\digital-twin`). Sistema de posicionamiento en tiempo real (RTLS) para seguridad de trabajadores en planta industrial.

**Propietario**: Paco. **Idioma**: español.

## Estado actual (2026-04-21)

**Fase**: diseño / preparación PoC. **No hay código aún**, solo documentación de arquitectura y decisiones. La próxima acción es el **scaffolding (Fase 0)** cuando Paco dé el OK después de validarlo con su cliente.

## Qué es

Sistema paralelo que recibe posiciones de trabajadores vía MQTT (UWB + ESP32, asumido), las persiste, evalúa proximidad a zonas peligrosas, dispara alertas y las visualiza en mapas 2D y 3D (xeokit).

La PoC se desarrollará como **proyecto independiente** clonando el stack del Digital Twin, con la intención de integrarlo como módulo del DT más adelante sin reescribir.

## Qué comparte con el Digital Twin

- **Auth server**: usa literalmente el `auth-server` del DT (puerto 9000, OAuth2 PKCE). Solo se registra un cliente nuevo `rtls-safetrack-web` en la tabla `oauth2_registered_client` del DT.
- **Stack técnico**: Spring Boot 3.5.6 / Java 21 / React 19 + Vite + TS / MUI 7 / xeokit 2.6 / Redux Toolkit / i18n / Docker.
- **Estilos, layout, AppBar, PlantSelector, OAuth2 PKCE flow, WebSocket STOMP**: clonados literal del DT.
- **NotificationDispatcher** (alertas email/in-app): patrón clonado; canal `HAPTIC_MQTT` es nuevo.

## Qué NO comparte (duplica)

- **Bases de datos**: `dt_safetrack` (MySQL) + `dt_safetrack_metrics` (MongoDB) nuevas.
- **Backend propio**: `positioning-api` (Spring Boot).
- **Frontend propio**: `positioning-frontend` (React).
- **Broker MQTT propio**: Mosquitto o EMQX en Docker.

## Cómo leer esta documentación

Toda la documentación técnica está en `./docs/`. Orden sugerido:

1. `docs/00_OVERVIEW.md` — visión general
2. `docs/01_CONTEXT_FROM_DT.md` — qué se comparte y qué se duplica del DT
3. `docs/02_ARCHITECTURE.md` — diagrama y componentes
4. `docs/03_MQTT_FORMAT.md` — modelo de datos interno (DTOs) y formato del simulador en PoC
5. `docs/04_DATA_MODEL.md` — esquema MySQL + MongoDB
6. `docs/05_HARDWARE_ASSUMPTIONS.md` — qué asumimos del HW (UWB, ESP32)
7. `docs/06_POC_PLAN.md` — fases de la PoC
8. `docs/07_OPEN_QUESTIONS.md` — preguntas abiertas para cliente
9. `docs/08_INTEGRATION_WITH_DT.md` — plan futuro de integración
10. `docs/09_GDPR_AND_SECURITY.md` — privacidad
11. `docs/10_VIEWS_AND_UX.md` — vistas 2D/3D, navegación

## Referencias al Digital Twin

- Raíz: `C:\PACO\workspaces\digital-twin`
- Docs principales: `digital-twin-backend/docs/` (ALERTAS_Y_NOTIFICACIONES.md, OT_GATEWAY_INTEGRATION_GUIDE.md, electrical-consumers/)
- El visor xeokit está en `digital-twin-frontend/src/components/XeoKitViewer/` — referencia clave para el visor 3D de RTLS Safetrack.
- Auth-server: `digital-twin-backend/auth-server/` — se reutiliza sin tocar.
- Patrón de alertas: `com.lci.dtapi.service.AlertEngineService` — clonamos este patrón para el zone engine.

## Convenciones del proyecto

- Comunicación: español.
- Documentación técnica: español (como el DT).
- Código y comentarios: inglés (como el DT).
- Nombres de tabla: prefijo `pos_` para todo lo nuestro (worker, tag, zone, etc.).
- Topics MQTT: los define el cliente. En PoC el simulador usa el namespace `sim/v1/...`. El `positioning-api` se adapta a lo que llegue mediante un adapter por proveedor.
- Flyway: numeración propia V1+, independiente del DT.

## Prioridades si Paco pide arrancar

1. Antes de nada, confirmar qué contestaron en la reunión (preguntas en `docs/07_OPEN_QUESTIONS.md`).
2. Fase 0 (scaffolding): 2-3 días. Proyecto arranca, login funciona, AppBar.
3. Fase 1 (ingestión MQTT + simulador): 3-4 días.
4. Fases 2-5: ver `docs/06_POC_PLAN.md`.

## Lo que NO hay que hacer

- **No tocar** el proyecto Digital Twin (`C:\PACO\workspaces\digital-twin`) desde aquí. Son proyectos separados.
- **No prometer** parada de máquinas por safety — este sistema no está certificado para safety funcional (ISO 13849 / IEC 62061). Solo alertas y trazabilidad. Ver `docs/09_GDPR_AND_SECURITY.md`.
- **No meter componentes nuestros antes del broker MQTT**. El broker es la frontera con el cliente. La traducción del payload del proveedor a nuestro modelo interno (`PositionEvent`) vive como **adapter dentro del `positioning-api`**, no como gateway pre-broker (ver `docs/02_ARCHITECTURE.md`).
