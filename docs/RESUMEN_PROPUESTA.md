# RTLS Safetrack — Resumen de Propuesta

> Documento de presentación. Visión simple y completa de cómo vamos a implementar el sistema partiendo de los datos MQTT que nos entregue el hardware de posicionamiento.

---

## 1. Qué es

**Sistema de Localización en Tiempo Real (RTLS) para seguridad de trabajadores en planta industrial.**

Sabemos en todo momento dónde está cada trabajador con precisión centimétrica, lo pintamos sobre planos 2D y modelos 3D, detectamos cuándo entra en una zona peligrosa, y disparamos alertas (vibración en el tag + notificación al equipo de seguridad + registro).

---

## 2. Qué hacemos / qué NO hacemos

| Sí hacemos | NO hacemos |
|---|---|
| Software completo (ingestión, lógica, visor, alertas) | Hardware (lo entrega el cliente / tercero) |
| Visor 2D y 3D en tiempo real | Parada automática de máquinas (no es safety-rated) |
| Motor de zonas y proximidad | Sustituir scanners láser, cortinas ópticas o safety PLC |
| Alertas multi-canal (in-app, email, vibración tag) | Certificación ISO 13849 / IEC 62061 |
| GDPR básico (TTL, roles, audit) | Outdoor / GPS |
| Trazabilidad e histórico de eventos | App móvil |

> **Importante**: este sistema es **complemento** de la capa safety certificada, no la sustituye.

---

## 3. Punto de partida: el broker MQTT es la frontera

**Regla arquitectural**: nada nuestro vive antes del broker MQTT. Todo lo que ocurre del lado del hardware es responsabilidad del cliente. Nosotros entramos en escena cuando un mensaje aterriza en el broker.

### Qué define esa frontera

El cliente (o su proveedor de hardware) decide:
- **Topics**: nombres y jerarquía.
- **Payload**: estructura de los mensajes.
- **QoS y retained**: política de entrega.
- **Frecuencia**: cuántos Hz por tag.

Nosotros nos adaptamos a lo que él publique.

### Información mínima que necesitamos por mensaje

Independientemente del formato concreto, cada mensaje de posición debe poder darnos (de alguna forma):

| Campo lógico | Por qué lo necesitamos |
|---|---|
| Identificador del tag | Saber quién es |
| Identificador de planta (si hay multi-planta) | Enrutar al contexto correcto |
| Timestamp | Ordenar y filtrar mensajes desfasados |
| Coordenadas X, Y, Z (en metros) | Posicionar sobre el modelo |
| Calidad / precisión | Saber si fiarnos del dato |

Y para `status` (cada 30 s o on-change): batería, estado del tag.

### Decisión clave: modelo interno propio, no formato MQTT propio

- **NO imponemos** un formato MQTT al cliente.
- Definimos un **modelo de datos interno** (`PositionEvent`, `TagStatus`, etc.) que es el que circula por nuestro código, REST y WebSocket.
- En la puerta de entrada (suscriptor MQTT del `positioning-api`) hay una capa **Adapter** con una implementación por proveedor que traduce *su* payload → nuestro modelo interno.
- Cambiar de proveedor = escribir un adapter nuevo. Nada más se entera.

### Dónde vive el broker

**El broker lo alojamos nosotros**, sobre un servidor on-premise en la propia fábrica (junto al resto de servicios del sistema). Da igual quién lo opere físicamente: lo importante es que vive en LAN industrial, no expuesto a internet, y es el único punto al que apunta el hardware del cliente.

> Sigue siendo la **frontera arquitectural**: aunque el broker corra en una máquina nuestra, conceptualmente lo que aterriza ahí es responsabilidad del cliente; lo que sale, nuestra.

---

## 4. Arquitectura

```
═══════════════════ LADO CLIENTE (no tocamos) ═══════════════════

   ┌───────────────┐                ┌───────────────────────┐
   │  Hardware     │                │  Simulador            │
   │  UWB + ESP32  │                │  (Python, herramienta │
   │  + firmware   │                │   de desarrollo)      │
   │  del cliente  │                │                       │
   └───────┬───────┘                └───────────┬───────────┘
           │ publica en SU formato              │ publica imitando
           │ y SUS topics                       │ al hardware real
           │                                    │
           └────────────────┬───────────────────┘
                            │
                            ▼
               ┌──────────────────────────────┐
               │   ░░░░░  MQTT BROKER  ░░░░░  │   ◄── FRONTERA
               │   (Mosquitto, servidor       │       (contrato)
               │    on-premise en fábrica)    │
               └──────────────┬───────────────┘
                              │ (suscripción)

═══════════════════ LADO NUESTRO (desde aquí) ═══════════════════

   ┌─────────────────────────────────────────────────────┐
   │  positioning-api (Spring Boot, :8090)               │
   │  ─────────────────────────────────────────────────  │
   │  • Suscriptor MQTT (Eclipse Paho)                   │
   │  • Adapter por proveedor (parsea SU payload         │
   │    → modelo interno)  ← una clase por fabricante    │
   │  • Persistencia (Mongo posiciones / MySQL CRUD)     │
   │  • Motor de Zonas (cada 500 ms - 1 s)               │
   │  • Despachador de alertas (in-app/email/háptico)    │
   │  • API REST + WebSocket STOMP                       │
   │  • Publica comandos MQTT al tag (formato cliente)   │
   └────┬───────────────┬────────────────┬───────────────┘
        │               │                │
        ▼               ▼                ▼
   ┌─────────┐   ┌─────────────┐  ┌─────────────────┐
   │  MySQL  │   │  MongoDB    │  │  Auth Server    │
   │ config  │   │ posiciones  │  │  OAuth2 (DT)    │
   │ + audit │   │ + histórico │  │  COMPARTIDO     │
   └─────────┘   └─────────────┘  └─────────────────┘
                                           ▲
                                           │ JWT
   ┌─────────────────────────────────────────────────────┐
   │  positioning-frontend (React + Vite, :5180)         │
   │  ─────────────────────────────────────────────────  │
   │  • Login OAuth2 PKCE                                │
   │  • Vista 2D (plano top-down)                        │
   │  • Vista 3D (xeokit sobre modelo XKT)               │
   │  • CRUD workers / tags / zonas                      │
   │  • Editor de zonas (polígonos extruidos)            │
   │  • Panel de alertas en tiempo real (WebSocket)      │
   │  • Histórico de eventos + export                    │
   └─────────────────────────────────────────────────────┘
```

**Lectura del diagrama**:
- A la izquierda del broker → **dominio del cliente**, no metemos código nuestro.
- El broker es el **único punto de contacto**.
- A la derecha → **todo es nuestro**: suscriptor + adapter + lógica + persistencia + UI.
- El **simulador**, aunque sea código nuestro, juega el rol del hardware: publica al broker como si fuera el cliente. Es una herramienta de desarrollo, no un componente del sistema en producción.

---

## 5. Componentes y responsabilidades

### Lado cliente (no es nuestro código)

| Componente | Rol |
|---|---|
| **Hardware UWB + ESP32 + firmware** | Mide posiciones y publica al broker. Lo gestiona el cliente / su proveedor. |

### Frontera

| Componente | Rol |
|---|---|
| **Broker MQTT** (Mosquitto 2 o el que ya tenga el cliente) | Único punto de contacto entre los dos lados. |

### Lado nuestro

| Componente | Lenguaje | Rol |
|---|---|---|
| **positioning-api** | Java 21 / Spring Boot 3.5.6 | Núcleo: suscriptor MQTT, **adapter por proveedor**, persistencia, motor de zonas, alertas, REST + WS, publicador de comandos. |
| **positioning-frontend** | React 19 / Vite / TS / MUI 7 | Visor 2D/3D, CRUD, panel de alertas, histórico. |
| **Auth Server** | (compartido con el Digital Twin) | OAuth2 PKCE. No se duplica, se reutiliza. |
| **MySQL** `dt_safetrack` | — | Configuración: workers, tags, zonas, eventos, audit. |
| **MongoDB** `dt_safetrack_metrics` | — | Posiciones actuales + histórico con TTL. |

### Herramienta de desarrollo (juega el papel del hardware)

| Componente | Lenguaje | Rol |
|---|---|---|
| **Simulador** | Python 3.11 | Emula 10-30 tags moviéndose, publica al broker imitando lo que haría el hardware real. Permite desarrollar y demo-ar sin HW. No es parte del sistema en producción. |

### Sobre el módulo Adapter (clave de esta arquitectura)

Dentro del `positioning-api`, el suscriptor MQTT delega el parseo a una interfaz `PositionEventAdapter`. Tendremos:
- `SimulatorAdapter` — para el formato que use el simulador en PoC.
- `<Vendor>Adapter` — uno por cada proveedor de hardware real que aparezca.

Cada adapter implementa: **payload del proveedor → `PositionEvent` interno**. La lógica de zonas, alertas y persistencia trabaja siempre sobre el modelo interno y nunca sabe de qué fabricante vino el dato.

> El "modelo interno" puede inspirarse en lo que ya estaba documentado como "formato v1" (ver `03_MQTT_FORMAT.md`), pero ahora vive como **DTOs en código**, no como contrato MQTT impuesto al cliente.

---

## 6. Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| Backend | Java 21 + Spring Boot 3.5.6 | Mismo stack que el Digital Twin → integración futura sencilla |
| Cliente MQTT | Eclipse Paho 5.x | Estándar, maduro |
| BD relacional | MySQL 8 | Mismo servidor que el DT |
| BD time-series | MongoDB 7 | TTL automático para retención GDPR |
| Real-time | WebSocket STOMP + SockJS | Mismo patrón que el DT |
| Frontend | React 19 + Vite 7 + MUI 7 + Redux Toolkit | Mismo stack que el DT |
| Visor 3D | xeokit-sdk 2.6 | Ya usado en el DT, modelos XKT disponibles |
| Auth | OAuth2 PKCE (auth-server del DT) | Identidad centralizada |
| Broker | Mosquitto 2 (PoC) / EMQX (prod si escala) | Ligero para PoC, migrable |
| Simulador | Python 3.11 + paho-mqtt | Rápido de escribir, fácil mantener |
| Despliegue | Docker + docker-compose | Un solo `docker compose up` arranca todo |

---

## 7. Infraestructura (despliegue)

Todo se levanta con **un solo `docker compose up`** en el servidor on-premise de la fábrica:

```
docker-compose.yml (RTLS Safetrack)
├── mosquitto              :1883        (broker MQTT — punto de entrada del HW)
├── positioning-api        :8090        (Spring Boot)
├── positioning-frontend   :5180        (Nginx servirá el build React)
├── mysql                  :3306        (schema dt_safetrack)
├── mongodb                :27017       (db dt_safetrack_metrics)
└── (auth-server del DT)   :9000        (external_link al docker-compose del DT)

[solo en desarrollo] simulator/         (Python, se arranca aparte para emular el HW)
```

**Red y seguridad**:
- Broker en LAN industrial, no expuesto a internet.
- Autenticación user/pass en `mosquitto.conf` (PoC); en producción, certificados.
- ACLs por topic (cuando madure).

**Requisitos del entorno**: máquina Linux con Docker + auth-server del DT corriendo + visibilidad de red entre el HW del cliente y el broker.

---

## 8. Flujo de datos (de extremo a extremo)

```
1. Tag UWB calcula posición (lado cliente)  → publica MQTT al broker
                                              (en SU formato, en SUS topics)
2. positioning-api (suscriptor MQTT)        → recibe payload crudo
3. Adapter del proveedor                    → traduce a PositionEvent interno
4. PositionIngestionService                 → valida, guarda en Mongo,
                                              envía por WebSocket al frontend
5. ZoneEngine (cada 500 ms - 1 s)           → ¿el tag está en zona peligrosa?
6. Si entra en zona con severity >= WARNING:
   ├─ crea ProximityEvent en MySQL
   ├─ canal IN_APP   → WebSocket /topic/alerts → toast en frontend
   ├─ canal EMAIL    → cola de notificaciones
   └─ canal HAPTIC   → publica MQTT command al broker
                       (en el formato del proveedor, vía adapter inverso)
                       → tag vibra
7. Frontend pinta avatar moviéndose en visor 3D + muestra alerta
8. Tag sale de zona                         → evento se cierra (exited_at)
```

**Latencia objetivo end-to-end: < 1 segundo.**

**Nota sobre el adapter inverso**: para los comandos servidor → tag, el adapter también traduce de nuestro modelo interno (`HapticCommand`) al formato/topic que el proveedor espera.

---

## 8-bis. Tiempo real en el frontend (cómo refrescamos posiciones)

**Mecanismo**: **WebSocket STOMP** sobre SockJS, mismo patrón que el Digital Twin. Sin polling, sin SSE, sin MQTT en el navegador.

### Flujo de conexión

```
1. Usuario abre la página de planta
2. Frontend → GET /api/v1/positions/current?plantId=SAFI_1
                  ↳ snapshot inicial inmediato (no espera al primer push)
3. Frontend → conecta STOMP a ws://.../api/ws con JWT
                  ↳ JwtHandshakeInterceptor valida (patrón del DT)
4. Frontend → SUBSCRIBE /topic/positions/{plantId}
                          /topic/alerts/{plantId}
5. positioning-api publica → Redux store actualiza → avatares re-renderizan
```

### Batching en el servidor

A 30 tags × 1 Hz son 30 msg/s. Reenviar uno a uno fuerza al frontend a re-renderizar 30 veces/s sin ganancia.

El `RealtimePositionPublisher` **acumula en buffer y emite cada 200-300 ms** un único mensaje con todos los cambios:

```json
{
  "ts": "2026-04-21T22:15:30.300Z",
  "positions": [
    {"tag_id": "...", "x": 12.3, "y": 56.7, "z": 1.2, "quality": "GOOD"},
    {"tag_id": "...", "x": 8.1,  "y": 22.4, "z": 1.2, "quality": "DEGRADED"}
  ]
}
```

### Interpolación en el cliente

Las posiciones llegan a ~1 Hz, los avatares deben moverse a 60 fps. El componente del visor:
- Guarda última posición + posición previa + timestamps de cada tag.
- En cada frame, interpola linealmente: `pos = lerp(prev, last, (now - tPrev) / (tLast - tPrev))`.
- Resultado: movimiento suave a pesar de la baja tasa de muestreo.

### Reconexión y recuperación

- SockJS reconecta automáticamente al perder conexión.
- Al reconectar, el cliente vuelve a pedir `GET /positions/current` para resincronizar el estado y luego sigue con el push.

### Permisos

- El JWT incluye plantas accesibles por el usuario.
- `JwtHandshakeInterceptor` rechaza la conexión si no hay token válido.
- Al hacer `SUBSCRIBE /topic/positions/{plantId}`, se valida que el usuario tiene permiso sobre esa planta.

### Topics WS expuestos

| Topic | Contenido |
|---|---|
| `/topic/positions/{plantId}` | Batch de posiciones cada 200-300 ms |
| `/topic/alerts/{plantId}` | Alertas de proximidad en cuanto se generan |
| `/user/queue/notifications` | Notificaciones dirigidas al usuario (futuro, alineado con DT) |

---

## 9. Modelo de datos (resumen)

### MySQL — `dt_safetrack` (config y eventos, prefijo `pos_`)

- `pos_workers` — empleados/contratistas que llevan tag
- `pos_tags` — dispositivos físicos
- `pos_safety_zones` — zonas (polígono 2D + altura z_min/z_max)
- `pos_zone_permissions` — qué roles pueden entrar en qué zonas
- `pos_proximity_events` — registro de entradas/salidas
- `pos_plant_settings` — configuración por planta (retención GDPR, transformación coordenadas)
- `pos_audit_log` — auditoría

### MongoDB — `dt_safetrack_metrics` (posiciones)

- `tag_positions_current` — 1 documento por tag, posición actual (upsert)
- `tag_positions_history` — todas las lecturas, **TTL 48h** automático
- `tag_positions_5min` / `_hourly` / `_daily` — agregaciones (futuro)

---

## 10. Plan PoC (4-5 semanas)

| Fase | Duración | Entregable |
|---|---|---|
| **0. Scaffolding** | 2-3 días | Proyectos arrancan, login OAuth2 funciona, AppBar con look&feel del DT |
| **1. Ingestión MQTT + simulador** | 3-4 días | 10 tags simulados publicando, posiciones persistidas, REST de consulta |
| **2. CRUD básico** | 3-4 días | Alta de workers/tags, asignación tag↔worker |
| **3. Visor 3D + 2D en tiempo real** | 1 semana | Ver los 10 tags moviéndose en xeokit y en plano 2D |
| **4. Zonas + motor de proximidad** | 1 semana | Editor de zonas, detección de entrada, alertas en panel |
| **5. Pulido + demo** | 3-5 días | Dashboard, histórico, i18n, vídeo de demo |

**Cronograma**: 2026-04-22 → finales de mayo 2026 para demo interna.

---

## 11. Criterios de aceptación de la PoC

1. Simulador publica 20 tags → todos visibles en tiempo real en el visor 3D
2. Admin crea worker + tag + asigna + define zona peligrosa
3. Tag entra en zona → alerta en panel **< 2 s**
4. Tag sale → evento cerrado con duración correcta
5. Histórico de eventos consultable con filtros + export CSV
6. Retención GDPR: posiciones >N días borradas automáticamente
7. Login/logout OAuth2 compartido con el Digital Twin funciona
8. Todo se levanta con un único `docker compose up`

---

## 12. Decisiones clave ya tomadas

| Decisión | Por qué |
|---|---|
| Proyecto **independiente** del Digital Twin (de momento) | No contaminar el DT mientras la PoC está inestable. Integración como módulo en Q3 2026. |
| **Auth-server compartido** con el DT | Identidad única, sin duplicar gestión de usuarios |
| **Bases de datos duplicadas** (`dt_safetrack`, `dt_safetrack_metrics`) | Schema en evolución; rollback fácil; sin riesgo para el DT |
| **El broker MQTT es la frontera**: nada nuestro vive antes de él | Limpieza de responsabilidades; el lado cliente es del cliente |
| **Adapter por proveedor dentro del `positioning-api`** (no servicio aparte, no gateway pre-broker) | Cambiar de proveedor = una clase nueva. Sin componente extra que desplegar y mantener. |
| **Modelo interno propio** (DTOs en código), NO contrato MQTT impuesto al cliente | Aceptamos el formato del cliente; la estabilidad la damos en nuestro código |
| **Simulador** desde el día 1 | PoC completa sin esperar al hardware real |
| **No paramos máquinas por software** | Sistema no es safety-rated (ISO 13849). Esa capa la pone safety PLC certificado. |
| **Coordenadas en sistema del modelo XKT** desde el inicio | En PoC matriz identidad; cuando llegue HW real se calibra en el adapter |

## 12-bis. Decisiones pendientes para la reunión

| Pregunta | Notas |
|---|---|
| **¿Qué tecnología/chip de UWB?** | Asumido Qorvo DW3000 sobre ESP32 — confirmar |
| **¿Tags comerciales o DIY?** | Comerciales (~80-150 €/u, batería meses) vs DIY ESP32-UWB (~40 €/u, batería 1-3 días) |
| **¿Formato y topics MQTT que va a publicar el HW?** | Necesario para escribir el adapter del proveedor |
| **¿Cuántos workers / tags / planta?** | Asumido 20-30, confirmar |
| **Servidor on-premise**: ¿lo aporta el cliente o lo aportamos nosotros?, ¿specs mínimas? | El broker + el resto del stack vivirán ahí |
| **Visibilidad de red**: ¿el HW puede llegar al broker en LAN industrial sin saltos raros? | Diseñar VLAN/firewall si hace falta |

---

## 13. Lo que NO entra en la PoC (para fase posterior)

- Hardware real (en PoC usamos simulador; HW llega +1 mes)
- Adapter del proveedor real (se escribe cuando conozcamos su formato; en PoC solo `SimulatorAdapter`)
- Calibración de la matriz UWB → IFC
- App móvil para managers
- Kiosko de binding tag↔worker
- Multi-planta (PoC = 1 planta piloto)
- Integración como módulo del Digital Twin (Q3 2026)
- GPS / outdoor
- Dashboards avanzados de ergonomía y exposición

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Hardware tarda en llegar | Simulador permite todo el desarrollo sin él |
| Cambio de proveedor de tags | Solo se escribe un nuevo adapter en `positioning-api`, el resto no se entera |
| Formato MQTT del fabricante desconocido / cambiante | El adapter absorbe la diferencia; el modelo interno permanece estable |
| Visibilidad de red HW → broker | Tratar en la reunión: VLAN, firewall, credenciales del broker |
| Calibración UWB compleja | Slot ya reservado en `pos_plant_settings.positioning_transform_matrix`; calibración dentro del adapter |
| Confusión safety vs trazabilidad | Documentado y comunicado: este sistema NO sustituye safety certificada |

---

## 15. Resumen ejecutivo en una frase

> **Construimos en 4-5 semanas una PoC que se suscribe al broker MQTT (la frontera con el cliente), normaliza lo que llegue mediante un adapter por proveedor, lo visualiza en 2D y 3D en tiempo real, detecta entradas en zonas peligrosas y dispara alertas en cascada — todo sobre el mismo stack del Digital Twin para integrarlo como módulo más adelante.**
