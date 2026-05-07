# 02. Arquitectura

## Principio rector

**El broker MQTT es la frontera del sistema.** Nada nuestro vive antes de él. Todo lo que ocurre del lado del hardware (medición, encapsulado, publicación al broker) es responsabilidad del cliente / su proveedor. Nuestro sistema entra en escena cuando un mensaje aterriza en el broker.

El broker, aunque lo alojemos físicamente nosotros sobre un servidor on-premise en la fábrica, sigue siendo conceptualmente la frontera: lo que aterriza ahí es del cliente; lo que sale, nuestro.

## Diagrama de alto nivel

```
═══════════════════ LADO CLIENTE (no tocamos) ═══════════════════

   ┌───────────────┐                ┌───────────────────────┐
   │  Hardware     │                │  Simulador            │
   │  UWB + ESP32  │                │  (Python, herramienta │
   │  + firmware   │                │   de desarrollo, juega│
   │  del cliente  │                │   el rol del HW)      │
   └───────┬───────┘                └───────────┬───────────┘
           │ publica en SU formato              │ publica imitando
           │ y SUS topics                       │ al hardware real
           │                                    │
           └────────────────┬───────────────────┘
                            │
                            ▼
               ┌──────────────────────────────────┐
               │   ░░░░░░  MQTT BROKER  ░░░░░░    │   ◄── FRONTERA
               │   Mosquitto 2 (Docker, :1883)    │       (contrato)
               │   On-premise en servidor fábrica │
               └──────────────┬───────────────────┘
                              │ (suscripción del positioning-api)

═══════════════════ LADO NUESTRO (desde aquí) ═══════════════════

   ┌─────────────────────────────────────────────────────────┐
   │  positioning-api (Spring Boot 3.5.6, :8090)             │
   │  ─────────────────────────────────────────────────────  │
   │                                                         │
   │   ┌─────────────────────────────────────────┐           │
   │   │ mqtt/                                   │           │
   │   │   • MqttSubscriberService (Eclipse Paho)│           │
   │   │   • adapter/                            │           │
   │   │       PositionEventAdapter (interfaz)   │           │
   │   │       SimulatorAdapter                  │           │
   │   │       <Vendor>Adapter (uno por HW real) │           │
   │   │   • MqttCommandPublisher (haptic)       │           │
   │   └─────────────────────────────────────────┘           │
   │                       │                                 │
   │                       ▼  PositionEvent (modelo interno) │
   │   ┌─────────────────────────────────────────┐           │
   │   │ ingestion/  PositionIngestionService    │           │
   │   │ zone/       ZoneEngineService (@Sched)  │           │
   │   │ alert/      ProximityNotificationDispatcher         │
   │   │ realtime/   RealtimePositionPublisher (WS, batch)   │
   │   │ worker/ tag/ zone/ event/  REST CRUD                │
   │   │ config/     SecurityConfig, WebSocketConfig, ...    │
   │   └─────────────────────────────────────────┘           │
   └────┬───────────────┬────────────────┬───────────────────┘
        │               │                │
        ▼               ▼                ▼
   ┌─────────┐   ┌─────────────┐  ┌─────────────────┐
   │  MySQL  │   │  MongoDB    │  │  Auth Server    │
   │ dt_     │   │ dt_         │  │  OAuth2 (DT,    │
   │ safe-   │   │ safetrack_  │  │   :9000)        │
   │ track   │   │ metrics     │  │  COMPARTIDO     │
   └─────────┘   └─────────────┘  └─────────────────┘
                                           ▲
                                           │ JWT
   ┌─────────────────────────────────────────────────────────┐
   │  positioning-frontend (React 19 + Vite + TS, :5180)     │
   │  ─────────────────────────────────────────────────────  │
   │  • Login OAuth2 PKCE (auth-server del DT)               │
   │  • Vista 2D: plano top-down con avatares                │
   │  • Vista 3D: xeokit con avatares sobre XKT              │
   │  • Vistas por zona (XKTs ligeros)                       │
   │  • CRUD workers/tags/zones                              │
   │  • Editor de zonas (polígonos 2D + altura z_min/z_max)  │
   │  • Panel de alertas realtime (WebSocket STOMP)          │
   │  • Histórico de eventos + export                        │
   │  • Interpolación lineal cliente para 60 fps             │
   └─────────────────────────────────────────────────────────┘
```

## Componentes y responsabilidades

### 1. Hardware (lado cliente)

- **No es nuestro código**.
- Tags UWB + anchors + ESP32 con firmware del cliente / su proveedor.
- Mide posiciones, las encapsula y las publica al broker MQTT en el formato y los topics que decida el cliente.
- En PoC inicial **no está disponible**; lo emula el simulador.

### 2. Simulador (Python) — herramienta de desarrollo

- **Propósito**: emular 10-30 tags publicando posiciones al broker para desarrollar y demoar sin hardware.
- **Ubicación**: `rtls-safetrack/simulator/`
- **Rol arquitectural**: **juega el papel del hardware**. No es un componente del sistema en producción. Vive en el lado izquierdo de la frontera, igual que vivirá el HW real.
- **Formato**: define un formato propio (ver `03_MQTT_FORMAT.md`) que el `SimulatorAdapter` del `positioning-api` sabe parsear. Cuando llegue el HW real con su formato, escribiremos un nuevo adapter — el simulador seguirá usando el suyo para tests.
- **Features**:
  - Cargar definición de tags desde YAML (id, nombre, trayectoria).
  - Simular trayectorias realistas (caminando 1.2 m/s, pausas, etc.).
  - Simular ruido de medida (±10 cm jitter).
  - Simular pérdidas de señal ocasionales (`quality: DEGRADED/BAD`).
  - Publicar `status` cada 30 s (batería bajando lentamente).

### 3. MQTT Broker

- **Imagen**: `eclipse-mosquitto:2` (PoC) o `emqx/emqx:5` (producción si escala).
- **Despliegue**: Docker en el servidor on-premise de la fábrica, junto al resto del stack.
- **Puertos**: 1883 (MQTT TCP). Opcionalmente 9001 (MQTT-over-WS, no necesario en PoC).
- **Red**: LAN industrial, no expuesto a internet.
- **Autenticación**: user/pass en `mosquitto.conf` (PoC). Producción: certificados.
- **Topics y payload**: los define el cliente (publicador). Los topics que el `positioning-api` se suscribe se configuran en `application.yml`.
- **ACLs por topic**: a definir cuando madure (separar publicadores HW de suscriptores aplicación).

### 4. Adapter por proveedor — dentro del positioning-api

> Lo que en versiones anteriores de la doc llamábamos "Positioning Gateway" y se pintaba **antes** del broker es ahora un **módulo dentro del `positioning-api`**, pasada la frontera. Razones: un componente menos que desplegar, sin re-publicación intermedia, debugging más simple, y se respeta la regla de no meter nada nuestro antes del broker.

- **Ubicación**: paquete `com.lci.rtls.positioning.mqtt.adapter`
- **Diseño**:
  - Interfaz `PositionEventAdapter`:
    - `boolean accepts(String topic, byte[] payload)`
    - `PositionEvent parse(String topic, byte[] payload)`
    - (inverso) `MqttPublication serialize(HapticCommand cmd, Tag tag)` para comandos
  - Implementaciones:
    - `SimulatorAdapter` — para PoC.
    - `<Vendor>Adapter` — uno por cada proveedor de hardware real que aparezca.
- El `MqttSubscriberService` recibe el payload crudo y delega al adapter elegido (por config / por topic / por header).
- La lógica posterior (zonas, alertas, persistencia) trabaja siempre sobre el modelo interno (`PositionEvent`) y nunca sabe de qué proveedor vino el dato.
- **Cuándo sacarlo fuera del api** (no es ahora): si aparecen otros consumidores de los datos normalizados, si la transformación se vuelve pesada (filtros Kalman, fusión multi-sensor) o si queremos aislar la dependencia del fabricante en un proceso aparte por estabilidad.

### 5. positioning-api (Spring Boot)

- **Puerto**: 8090, context-path `/api` (como el DT).
- **Paquete raíz**: `com.lci.rtls.positioning`.
- **Subsistemas**:
  - `mqtt/` — `MqttSubscriberService` (Paho), `adapter/` (parsing por proveedor), `MqttCommandPublisher`.
  - `ingestion/` — `PositionIngestionService`: upsert `tag_positions_current`, insert `tag_positions_history`.
  - `zone/` — `ZoneEngineService` (`@Scheduled` 500 ms - 1 s), máquina de estados por (tag, zone).
  - `alert/` — `ProximityNotificationDispatcher` con canales (in-app, email, haptic MQTT).
  - `realtime/` — `RealtimePositionPublisher` (WebSocket STOMP, batch cada 200-300 ms).
  - `worker/`, `tag/`, `zone/`, `event/` — REST CRUD.
  - `config/` — `SecurityConfig`, `WebSocketConfig`, `MqttConfig`, `JwtHandshakeInterceptor`.

### 6. positioning-frontend (React)

- **Puerto**: 5180 en dev. Nginx servirá el build en producción.
- **Estructura de `src/`**:
  - `pages/` — Login, Callback, Dashboard, PlantView (2D+3D), WorkerMgmt, TagMgmt, ZoneEditor, EventsHistory, SafetyPanel.
  - `components/` — AvatarLayer3D, AvatarLayer2D, Floorplan2DViewer, ZonePolygonEditor, AlertDrawer.
  - `services/api.ts`, `services/websocket.ts` (clonado del DT).
  - `store/` — slices (positions, workers, tags, zones, alerts, auth).
  - El resto (theme, i18n, config, context, utils, hooks) clonado del DT.

### 7. Bases de datos

Ver `04_DATA_MODEL.md` para detalle de tablas y colecciones.

### 8. Auth-Server (compartido con DT)

- No se instancia en este proyecto. Se asume corriendo en `localhost:9000` (del Digital Twin).
- En el `docker-compose.yml` de Safetrack, el auth-server se declara como `external_links` o se ejecuta primero el compose del DT.

## Flujo de datos en modo PoC (con simulador)

```
1. simulator.py publica al broker
   → topic: <topic que el SimulatorAdapter sabe consumir>
   → payload: formato definido en 03_MQTT_FORMAT.md

2. positioning-api / MqttSubscriberService:
   - recibe el mensaje crudo del broker
   - elige el adapter (SimulatorAdapter en PoC)
   - adapter.parse() → PositionEvent (modelo interno)

3. PositionIngestionService:
   - valida con Bean Validation
   - upsert en Mongo tag_positions_current (1 doc por tag)
   - insert en Mongo tag_positions_history (TTL 48 h)
   - entrega al RealtimePositionPublisher

4. RealtimePositionPublisher (batch cada 200-300 ms):
   - acumula posiciones nuevas en buffer
   - emite un único mensaje STOMP a /topic/positions/{plantId}
     con el array de cambios

5. ZoneEngine (@Scheduled cada 500 ms - 1 s):
   - lee todas las posiciones actuales de la planta (Mongo)
   - para cada pareja (tag, zone_active): evalúa punto-en-polígono + rango Z
   - transiciona estado (OUTSIDE → APPROACHING → INSIDE → LEFT)
   - si INSIDE con severity >= WARNING:
       * crea proximity_event en MySQL (status=OPEN)
       * dispara alerta vía ProximityNotificationDispatcher
           - canal IN_APP: STOMP /topic/alerts/{plantId}
           - canal EMAIL: cola notificaciones (patrón DT)
           - canal HAPTIC_MQTT:
               adapter.serialize(HapticCommand, tag)
               → MqttCommandPublisher publica al broker
                 (en el formato/topic del proveedor del tag)

6. frontend:
   - en Page mount → GET /api/v1/positions/current?plantId=X (snapshot)
   - WS suscrito a /topic/positions/{plantId}
   - Redux store recibe batch → actualiza positions
   - Componente del visor interpola entre frames a 60 fps (lerp)
   - WS suscrito a /topic/alerts/{plantId} → toast + badge
```

## Stack tecnológico

| Capa | Elección | Por qué |
|------|----------|---------|
| Lenguaje backend | Java 21 + Spring Boot 3.5.6 | Consistencia con DT |
| Cliente MQTT | Eclipse Paho 5.x | Maduro, estándar, sin dependencias raras |
| DB relacional | MySQL 8 | Mismo servidor del DT |
| DB time-series | MongoDB 7 | Mismo servidor del DT, patrón TTL ya probado |
| Real-time frontend | WebSocket STOMP + SockJS | Idéntico al DT |
| Frontend | React 19 + Vite 7 + MUI 7 | Consistencia con DT |
| Visor 3D | xeokit-sdk 2.6 | Consistencia con DT, XKTs ya disponibles |
| Broker MQTT | Mosquitto 2 | Ligero, suficiente para PoC; EMQX opcional para prod |
| Simulador | Python 3.11 + paho-mqtt | Rápido de escribir, menos peso que otro Spring Boot |

## Decisiones cerradas

- **Broker on-premise nuestro** sobre servidor en la fábrica (LAN industrial, no internet).
- **Adapter integrado en positioning-api**, no como servicio separado.
- **Modelo interno propio** (`PositionEvent`, `TagStatus`, `HapticCommand`), no contrato MQTT impuesto al cliente.
- **MongoDB y MySQL compartidas** con el DT por eficiencia de recursos en dev. En prod se separarían (IEC 62443).

## Decisiones pendientes (Fase 0)

1. ¿Mosquitto o EMQX? → Empezamos con Mosquitto por simplicidad. Migrar a EMQX es 1 día.
2. ¿Nginx reverse proxy propio o cada servicio en su puerto? → Propio (para que en dev veamos `http://localhost/safetrack` y en prod sea trivial exponer).
3. ¿Specs del servidor on-premise? — pendiente de la reunión con cliente.
