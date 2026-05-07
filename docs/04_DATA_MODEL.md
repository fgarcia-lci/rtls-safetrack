# 04. Modelo de datos

## MySQL — `dt_safetrack`

Prefijo `pos_` para todas las tablas del proyecto (para que sea trivial distinguirlas cuando se integre al DT en el mismo MySQL).

### `pos_workers` — Personal de la planta

Tabla maestra de trabajadores. **Independiente** de `users` (auth) — un worker puede ser también usuario del sistema (supervisor, responsable de seguridad) o no (operario de planta, subcontrata).

```sql
CREATE TABLE pos_workers (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_code   VARCHAR(50) NOT NULL UNIQUE,       -- código único en empresa
  full_name       VARCHAR(200) NOT NULL,
  phone           VARCHAR(50),
  email           VARCHAR(200),
  company_name    VARCHAR(200) NOT NULL,             -- LCI, Subcontrata X, Visitante
  company_type    ENUM('INTERNAL','CONTRACTOR','VISITOR') NOT NULL DEFAULT 'INTERNAL',
  role_in_plant   VARCHAR(100),                      -- texto libre: operario, supervisor...
  linked_user_id  VARCHAR(36) NULL,                  -- FK soft a users(id) del DT (auth) si el worker es también usuario
  supervisor_user_id VARCHAR(36) NULL,               -- FK soft a users(id) del DT — supervisor directo (a quién notificar si el flag de la zona lo pide)
  hire_date       DATE,
  photo_url       VARCHAR(500),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      VARCHAR(36),
  updated_by      VARCHAR(36),
  INDEX idx_employee_code (employee_code),
  INDEX idx_linked_user (linked_user_id),
  INDEX idx_company (company_name),
  INDEX idx_is_active (is_active)
);
```

**Notas**:
- `linked_user_id` es FK "soft" — no declarada en Flyway porque la BD `dt_safetrack` no conoce `dt_lci`. Se valida en aplicación o, cuando se integre al DT, se vuelve FK real.
- `company_type = VISITOR` sirve para externos puntuales (inspectores, comerciales).
- Sin FK a `plants` — un worker puede trabajar en varias plantas en el tiempo. Si luego hace falta, se crea `pos_worker_plant_assignments`.

### `pos_tags` — Dispositivos físicos de localización

```sql
CREATE TABLE pos_tags (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  serial                   VARCHAR(100) NOT NULL UNIQUE,  -- ID que publica el tag (MAC o similar)
  model                    VARCHAR(100),                  -- Makerfabs ESP32-UWB, Pozyx, ...
  vendor                   VARCHAR(100),                  -- LCI-DIY, Pozyx, Sewio...
  firmware_version         VARCHAR(50),
  battery_last_pct         TINYINT,                       -- último % conocido
  last_seen_at             TIMESTAMP NULL,                -- última vez que publicó
  state                    ENUM('ACTIVE','IDLE','LOW_BATTERY','LOST','UNKNOWN','DECOMMISSIONED') NOT NULL DEFAULT 'UNKNOWN',
  assigned_worker_id       BIGINT NULL,                   -- NULL = tag sin asignar (pool)
  assigned_at              TIMESTAMP NULL,
  plant_id                 VARCHAR(50) NOT NULL,          -- planta donde está (soft FK a plants)
  notes                    TEXT,
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_worker_id) REFERENCES pos_workers(id) ON DELETE SET NULL,
  INDEX idx_serial (serial),
  INDEX idx_assigned (assigned_worker_id),
  INDEX idx_plant (plant_id),
  INDEX idx_state (state)
);
```

**Notas**:
- Un tag puede estar sin asignar (pool) o asignado a un worker. Si lo reasignas, se actualiza `assigned_at`.
- Histórico de asignaciones: `pos_tag_assignments_history` (a futuro, no PoC).

### `pos_safety_zones` — Zonas con reglas de seguridad

```sql
CREATE TABLE pos_safety_zones (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  plant_id                 VARCHAR(50) NOT NULL,
  code                     VARCHAR(50) NOT NULL,          -- Z_CCM_03
  name                     VARCHAR(200) NOT NULL,
  description              TEXT,
  type                     ENUM('DANGER','RESTRICTED','WARNING','SAFE','INFO') NOT NULL,
  severity                 TINYINT NOT NULL DEFAULT 3,    -- 1=info, 5=crítico
  polygon_2d               JSON NOT NULL,                 -- array de [x,y] en orden (polígono cerrado)
  z_min                    DECIMAL(6,3) NOT NULL,         -- altura mínima (m)
  z_max                    DECIMAL(6,3) NOT NULL,         -- altura máxima (m)
  buffer_approach_m        DECIMAL(4,2) DEFAULT 2.0,      -- distancia de "acercamiento"
  related_device_id        VARCHAR(50) NULL,              -- FK soft a device_catalog del DT
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  display_color            VARCHAR(9),                    -- #RRGGBB(AA) para pintar en mapa
  action_on_entry          JSON,                          -- [{"channel":"HAPTIC","pattern":"WARNING"}, ...]
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by               VARCHAR(36),
  UNIQUE KEY uk_plant_code (plant_id, code),
  INDEX idx_plant_active (plant_id, is_active),
  INDEX idx_type (type)
);
```

**Notas**:
- `polygon_2d` es un polígono en XY (top-down), cerrado. Punto-en-polígono con ray casting.
- `z_min, z_max`: la zona es un prisma vertical (suficiente 95% de los casos, y computacionalmente trivial). Para geometrías complejas, a futuro.
- `action_on_entry`: acciones automáticas a disparar cuando un tag entra (nuestro motor de alertas los procesa).

### `pos_zone_permissions` — Qué roles pueden entrar a qué zonas

```sql
CREATE TABLE pos_zone_permissions (
  zone_id                  BIGINT NOT NULL,
  role_code                VARCHAR(50) NOT NULL,         -- ROLE_MAINTENANCE, ROLE_SUPERVISOR...
  PRIMARY KEY (zone_id, role_code),
  FOREIGN KEY (zone_id) REFERENCES pos_safety_zones(id) ON DELETE CASCADE
);
```

Si un trabajador sin rol permitido entra → alerta de mayor severidad.

### `pos_zone_notification_policies` — A quién avisar cuando se entra en una zona

Modelo "configurable por zona". Cada zona puede activar uno o varios destinatarios. Default: solo el trabajador (háptica).

```sql
CREATE TABLE pos_zone_notification_policies (
  zone_id                       BIGINT PRIMARY KEY,
  notify_worker                 BOOLEAN NOT NULL DEFAULT TRUE,    -- háptica al tag (canal HAPTIC_MQTT)
  notify_supervisor             BOOLEAN NOT NULL DEFAULT FALSE,   -- supervisor directo del worker (pos_workers.supervisor_user_id)
  notify_safety_team            BOOLEAN NOT NULL DEFAULT FALSE,   -- usuarios con ROLE_OPERATOR (equipo de seguridad)
  notify_all_managers           BOOLEAN NOT NULL DEFAULT FALSE,   -- todos los managers de la planta
  channel_in_app                BOOLEAN NOT NULL DEFAULT TRUE,    -- toast + drawer en frontend
  channel_email                 BOOLEAN NOT NULL DEFAULT FALSE,
  channel_haptic_mqtt           BOOLEAN NOT NULL DEFAULT TRUE,    -- solo aplica si notify_worker=TRUE
  custom_recipients             JSON NULL,                        -- ["user_id_1", "user_id_2"] override puntual
  FOREIGN KEY (zone_id) REFERENCES pos_safety_zones(id) ON DELETE CASCADE
);
```

**Notas**:
- El `ProximityNotificationDispatcher` lee la policy y resuelve destinatarios:
  - `notify_worker` + `channel_haptic_mqtt` → publica `HapticCommand` al broker.
  - `notify_supervisor` → resuelve `pos_workers.supervisor_user_id` y notifica a ese user.
  - `notify_safety_team` → query `users` con `ROLE_OPERATOR`.
  - `notify_all_managers` → query `users` con permiso `PLANT_MANAGE` o equivalente.
- Si la zona no tiene fila en esta tabla, aplica el default (solo háptica al worker + in-app).

### `pos_zone_schedules` — Horarios de activación de zonas

```sql
CREATE TABLE pos_zone_schedules (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  zone_id                  BIGINT NOT NULL,
  day_of_week              TINYINT NOT NULL,             -- 1=lunes ... 7=domingo
  start_time               TIME NOT NULL,
  end_time                 TIME NOT NULL,
  FOREIGN KEY (zone_id) REFERENCES pos_safety_zones(id) ON DELETE CASCADE,
  INDEX idx_zone (zone_id)
);
```

Si una zona está activa solo cuando la máquina funciona, no alertes en fin de semana.

### `pos_proximity_events` — Registro de entradas/salidas

```sql
CREATE TABLE pos_proximity_events (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  worker_id                BIGINT NULL,                  -- puede ser NULL si tag sin asignar
  tag_id                   BIGINT NOT NULL,
  zone_id                  BIGINT NOT NULL,
  plant_id                 VARCHAR(50) NOT NULL,
  entered_at               TIMESTAMP(3) NOT NULL,
  exited_at                TIMESTAMP(3) NULL,            -- NULL mientras está dentro
  duration_sec             INT GENERATED ALWAYS AS (TIMESTAMPDIFF(SECOND, entered_at, COALESCE(exited_at, NOW()))) STORED,
  entry_point              JSON,                         -- {x,y,z} donde entró
  exit_point               JSON,
  max_severity             TINYINT,
  actions_taken            JSON,                         -- [{channel, pattern, ts}]
  authorized               BOOLEAN,                      -- worker tenía permiso para entrar?
  acknowledged_at          TIMESTAMP NULL,
  acknowledged_by          VARCHAR(36),
  FOREIGN KEY (worker_id) REFERENCES pos_workers(id) ON DELETE SET NULL,
  FOREIGN KEY (tag_id) REFERENCES pos_tags(id),
  FOREIGN KEY (zone_id) REFERENCES pos_safety_zones(id),
  INDEX idx_worker_entered (worker_id, entered_at DESC),
  INDEX idx_zone_entered (zone_id, entered_at DESC),
  INDEX idx_plant_entered (plant_id, entered_at DESC),
  INDEX idx_open_events (exited_at, plant_id)            -- para consultar eventos abiertos
);
```

### `pos_anchors` — Anchors UWB instalados

```sql
CREATE TABLE pos_anchors (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  plant_id                 VARCHAR(50) NOT NULL,
  code                     VARCHAR(50) NOT NULL,          -- A_01
  serial                   VARCHAR(100),
  pos_x                    DECIMAL(10,4),                 -- coords en sistema IFC
  pos_y                    DECIMAL(10,4),
  pos_z                    DECIMAL(6,3),
  is_master                BOOLEAN DEFAULT FALSE,
  last_seen_at             TIMESTAMP NULL,
  firmware_version         VARCHAR(50),
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  notes                    TEXT,
  UNIQUE KEY uk_plant_code (plant_id, code),
  INDEX idx_plant (plant_id)
);
```

Informativo en PoC. En producción puede ser la base de dashboards de salud del sistema.

### `pos_plant_views` — Vistas disponibles por planta (2D y 3D)

```sql
CREATE TABLE pos_plant_views (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  plant_id                 VARCHAR(50) NOT NULL,
  code                     VARCHAR(50) NOT NULL,          -- GENERAL_2D, AREA_A_3D, CCM_ROOM_3D
  name                     VARCHAR(200) NOT NULL,
  type                     ENUM('FLOORPLAN_2D','MODEL_3D') NOT NULL,
  asset_url                VARCHAR(500) NOT NULL,         -- /models/xxx.xkt o /floorplans/xxx.svg
  bbox                     JSON,                          -- {xmin,ymin,zmin,xmax,ymax,zmax}
  default_camera           JSON,                          -- {eye,look,up} para 3D
  display_order            INT DEFAULT 0,
  thumbnail_url            VARCHAR(500),
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_plant_code (plant_id, code),
  INDEX idx_plant_active (plant_id, is_active)
);
```

### `pos_plant_settings` — Config por planta

```sql
CREATE TABLE pos_plant_settings (
  plant_id                         VARCHAR(50) PRIMARY KEY,
  positioning_transform_matrix     JSON,                  -- matriz 4x4, default: identidad
  bbox                              JSON,                  -- bbox de la planta (validación)
  default_view_id                   BIGINT,
  mqtt_broker_url                   VARCHAR(500),
  mqtt_user                         VARCHAR(100),
  mqtt_pass_secret_ref              VARCHAR(200),          -- referencia a secret manager
  positions_history_retention_days  INT DEFAULT 7,         -- GDPR
  created_at                        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `pos_audit_log` — Auditoría (GDPR)

```sql
CREATE TABLE pos_audit_log (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  ts                       TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  user_id                  VARCHAR(36),
  action                   VARCHAR(100),                  -- VIEW_POSITIONS, EXPORT_EVENTS...
  resource_type            VARCHAR(50),
  resource_id              VARCHAR(200),
  details                  JSON,
  ip_address               VARCHAR(45),
  INDEX idx_user_ts (user_id, ts DESC),
  INDEX idx_action_ts (action, ts DESC)
);
```

## MongoDB — `dt_safetrack_metrics`

Patrón idéntico al DT con colecciones time-series + TTL.

### `tag_positions_current`

Una posición por tag (upsert). Sin TTL — se borra solo cuando el tag deja de usarse (job manual).

```json
{
  "_id": "tag:E8:9F:6D:12:34:56",
  "tag_id": "E8:9F:6D:12:34:56",
  "plant_id": "SAFI_1",
  "worker_id": 1234,
  "ts": ISODate("2026-04-21T22:15:30.123Z"),
  "pos": { "x": 12.34, "y": 56.78, "z": 1.20 },
  "accuracy_m": 0.15,
  "quality": "GOOD",
  "state": "ACTIVE",
  "zone_current": "zone_safe_area_a",
  "battery_pct": 78,
  "updated_at": ISODate("2026-04-21T22:15:30.200Z")
}
```

**Índices**:
- `{ plant_id: 1 }` — consulta de todas las posiciones de una planta.
- `{ worker_id: 1 }` — posición actual de un worker.
- `{ updated_at: 1 }` — detectar stale.

### `tag_positions_5min` (TTL 48h)

Histórico raw a 1Hz. Cada documento = una muestra.

```json
{
  "_id": ObjectId("..."),
  "tag_id": "E8:9F:6D:12:34:56",
  "plant_id": "SAFI_1",
  "worker_id": 1234,
  "ts": ISODate("2026-04-21T22:15:30.123Z"),
  "pos": { "x": 12.34, "y": 56.78, "z": 1.20 },
  "accuracy_m": 0.15,
  "quality": "GOOD"
}
```

**Índices**:
- `{ plant_id: 1, ts: -1 }`
- `{ tag_id: 1, ts: -1 }`
- `{ worker_id: 1, ts: -1 }`
- TTL on `ts` con `expireAfterSeconds: 172800` (48h).

### `tag_positions_hourly` (TTL 7d)

Agregado: 1 muestra por minuto (downsampling). Scheduled job @Scheduled hourly.

```json
{
  "_id": ObjectId("..."),
  "tag_id": "E8:9F:6D:12:34:56",
  "plant_id": "SAFI_1",
  "worker_id": 1234,
  "hour": ISODate("2026-04-21T22:00:00Z"),
  "samples": [ /* 60 muestras, una por minuto */ ],
  "duration_in_plant_sec": 3300,
  "distinct_zones_visited": ["zone_a", "zone_b"]
}
```

### `tag_positions_daily` (TTL configurable, default 7d, max 30d por GDPR)

Agregado del día: entrada/salida de planta, zonas visitadas, heatmap.

```json
{
  "_id": ObjectId("..."),
  "tag_id": "...",
  "worker_id": 1234,
  "plant_id": "SAFI_1",
  "date": "2026-04-21",
  "first_seen": ISODate("..."),
  "last_seen": ISODate("..."),
  "total_active_minutes": 480,
  "zones_visited": [
    { "zone_id": 5, "entries": 3, "total_duration_sec": 600 }
  ],
  "heatmap_2d": [ /* array de [x, y, density] */ ]
}
```

### `proximity_alerts_realtime`

Cola de alertas generadas por el zone engine pendientes de ACK. Sin TTL, se archivan manualmente.

```json
{
  "_id": ObjectId("..."),
  "created_at": ISODate("..."),
  "worker_id": 1234,
  "tag_id": "...",
  "zone_id": 5,
  "plant_id": "SAFI_1",
  "severity": 5,
  "position_on_entry": { "x": 12.3, "y": 56.7, "z": 1.2 },
  "actions_dispatched": [
    { "channel": "HAPTIC_MQTT", "ts": ISODate("..."), "success": true },
    { "channel": "IN_APP", "ts": ISODate("...") }
  ],
  "acknowledged_at": null,
  "acknowledged_by": null
}
```

## Relaciones principales (diagrama lógico)

```
pos_workers (1) ──(0..N) pos_tags
pos_workers (0..1) ──── users (DT, cross-DB)
pos_tags (1) ──(0..N) pos_proximity_events
pos_safety_zones (1) ──(0..N) pos_zone_permissions
pos_safety_zones (1) ──(0..N) pos_zone_schedules
pos_safety_zones (1) ──(0..N) pos_proximity_events
pos_safety_zones (0..1) ──── device_catalog (DT, cross-DB via related_device_id)
pos_plants via plant_id (soft FK a plants del DT)

MongoDB:
tag_positions_current (1 por tag activo) ↔ pos_tags.serial
tag_positions_5min ──► agrega ──► tag_positions_hourly ──► tag_positions_daily
```

## Volumen estimado (para PoC y pre-prod)

- 30 tags × 1 Hz × 8h turno = 864.000 inserciones/día en `tag_positions_5min`.
- 48h de retención → ~1.7M docs activos. Con índices y TTL, MongoDB lo maneja sobrado.
- `tag_positions_hourly` (1 min granularity): 30 × 60 × 8 = 14.400/día × 7d = 100k docs. Trivial.
- `tag_positions_daily`: 30 × 1 × 30 = 900 docs. Despreciable.

Para 1 planta con 100 tags (escala prod prevista), multiplica por 3-4x. Sigue siendo asumible.
