# RTLS Safetrack

**Real-Time Safety Tracking** — sistema de posicionamiento interior (RTLS) para monitorización de trabajadores en planta industrial, con alertas de proximidad a zonas peligrosas.

**Estado**: Fase 0 (scaffolding) completada. Próxima fase: ingestión MQTT + simulador (`docs/06_POC_PLAN.md`).

## Estructura del repositorio

```
rtls-safetrack/
├── README.md                  Este archivo
├── CLAUDE.md                  Contexto para Claude (IA asistente)
├── .gitignore
│
├── docs/                      Documentación técnica y de diseño
│   ├── 00_OVERVIEW.md             Visión general
│   ├── 01_CONTEXT_FROM_DT.md      Qué se comparte y duplica del DT
│   ├── 02_ARCHITECTURE.md         Diagrama y componentes
│   ├── 03_MQTT_FORMAT.md          Modelo interno (DTOs) y formato del simulador
│   ├── 04_DATA_MODEL.md           Esquema MySQL + MongoDB
│   ├── 05_HARDWARE_ASSUMPTIONS.md
│   ├── 06_POC_PLAN.md             Fases 0-5 del PoC
│   ├── 07_OPEN_QUESTIONS.md       Preguntas y respuestas
│   ├── 08_INTEGRATION_WITH_DT.md
│   ├── 09_GDPR_AND_SECURITY.md
│   ├── 10_VIEWS_AND_UX.md
│   ├── ROLES_MAPPING.md           Mapeo de roles DT → Safetrack
│   ├── ROLLBACK.md                Cómo desinstalar sin afectar al DT
│   ├── RESUMEN_PROPUESTA.md       Documento de presentación
│   └── STARTUP.md                 ★ Cómo arrancar el sistema
│
├── positioning-api/           Backend Spring Boot (Java 21, puerto 8090)
│   ├── pom.xml                    Spring Boot 3.5.6, Paho v5
│   ├── mvnw, mvnw.cmd, .mvn/      Maven Wrapper (clonado del DT)
│   └── src/main/
│       ├── java/com/lci/rts/positioning/
│       │   ├── PositioningApiApplication.java
│       │   └── config/                Security, WebSocket, JwtHandshakeInterceptor
│       └── resources/
│           ├── application.yml
│           └── db/migration/V1__init_schema.sql   Tablas pos_*
│
├── positioning-frontend/      Frontend React 19 + Vite (puerto 5180)
│   ├── package.json
│   ├── vite.config.ts, tsconfig.*, eslint.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx, App.tsx, index.css
│       ├── theme/, i18n/, config/         Theme MUI, i18n EN/ES, config app
│       ├── context/AuthContext.tsx        OAuth2 PKCE
│       ├── utils/oauth2.ts                Cliente PKCE
│       ├── services/api.ts, websocket.ts  axios + STOMP
│       ├── components/                    MainLayout, UserMenu, LanguageSelector,
│       │                                  PlantSelector, ProtectedRoute
│       └── pages/                         Login, Callback, Dashboard, Live, Workers,
│                                          Tags, Zones, Events (placeholders)
│
├── simulator/                 Python (vacío — se implementa en Fase 1)
│
├── infra/
│   ├── docker-compose.yml         Mosquitto :1883
│   └── mosquitto/mosquitto.conf
│
├── scripts/
│   ├── setup-databases.sql        CREATE DATABASE dt_safetrack
│   ├── register-oauth2-client.sql Registra cliente OAuth2 en el DT (idempotente)
│   ├── teardown.sql               Rollback completo MySQL
│   ├── teardown-mongo.js          Rollback Mongo
│   └── start.ps1                  Arranca Mosquitto + api + frontend
│
└── (CLAUDE memory en %USERPROFILE%\.claude\projects\...)
```

## Arrancar el sistema

Ver **`docs/STARTUP.md`** para el procedimiento detallado.

Arranque rápido (asumiendo que el setup inicial está hecho — ver STARTUP.md para la primera vez):

```powershell
.\scripts\start.ps1
```

Eso arranca:
- Mosquitto (Docker, :1883)
- positioning-api (Maven Wrapper, :8090)
- positioning-frontend (Vite, :5180)

Y abre el navegador en `http://localhost:5180`.

## Proyecto hermano (Digital Twin)

Este sistema nace como hermano del Digital Twin (`C:\PACO\workspaces\digital-twin`):
- **Comparte** el auth-server OAuth2 (puerto 9000).
- **Duplica** sus bases de datos (`dt_safetrack` y `dt_safetrack_metrics`) para garantizar rollback limpio (ver `docs/ROLLBACK.md`).
- Está diseñado para integrarse como módulo del DT en Q3 2026 si la PoC se aprueba.

Ver `docs/01_CONTEXT_FROM_DT.md` para detalles.

## Estado por fase

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Scaffolding (api, frontend, login, BD inicial) | ✅ COMPLETADA |
| 1 | Ingestión MQTT + simulador | Próxima |
| 2 | CRUD workers/tags | Pendiente |
| 3 | Visor 3D con avatares interpolados | Pendiente |
| 4 | Zonas + motor de proximidad + alertas | Pendiente |
| 5 | Pulido + dashboard + modo demo guionizado | Pendiente |

Ver `docs/06_POC_PLAN.md` para el detalle.

## Rollback

Si la PoC no se aprueba, ver `docs/ROLLBACK.md` para desinstalar todo dejando el Digital Twin intacto.
