-- =============================================================================
-- RTLS Safetrack — Flyway V1: schema inicial
--
-- Crea todas las tablas pos_* en la BD `dt_safetrack`.
-- La BD debe existir antes (ver scripts/setup-databases.sql).
--
-- Convenciones:
--   - Prefijo `pos_` en todas las tablas para no colisionar con las del DT
--     cuando se integre (Q3 2026).
--   - Charset utf8mb4 implícito por config del servidor.
--   - FKs soft (no declaradas) hacia entidades de la BD `dt_lci` del DT
--     (users, plants, device_catalog) porque están en otra schema y se
--     valida en aplicación.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pos_workers — personal de la planta (puede no ser usuario del sistema)
-- -----------------------------------------------------------------------------
CREATE TABLE pos_workers (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_code       VARCHAR(50)  NOT NULL UNIQUE,
  full_name           VARCHAR(200) NOT NULL,
  phone               VARCHAR(50),
  email               VARCHAR(200),
  company_name        VARCHAR(200) NOT NULL,
  company_type        ENUM('INTERNAL','CONTRACTOR','VISITOR') NOT NULL DEFAULT 'INTERNAL',
  role_in_plant       VARCHAR(100),
  linked_user_id      VARCHAR(36)  NULL,            -- FK soft a users(id) del DT si el worker es también usuario del sistema
  supervisor_user_id  VARCHAR(36)  NULL,            -- FK soft a users(id) del DT — supervisor directo (destinatario de notify_supervisor)
  hire_date           DATE,
  photo_url           VARCHAR(500),
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by          VARCHAR(36),
  updated_by          VARCHAR(36),
  INDEX idx_employee_code (employee_code),
  INDEX idx_linked_user   (linked_user_id),
  INDEX idx_supervisor    (supervisor_user_id),
  INDEX idx_company       (company_name),
  INDEX idx_is_active     (is_active)
);

-- -----------------------------------------------------------------------------
-- 2. pos_safety_zones — zonas con reglas de seguridad
-- -----------------------------------------------------------------------------
CREATE TABLE pos_safety_zones (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  plant_id            VARCHAR(50)  NOT NULL,
  code                VARCHAR(50)  NOT NULL,        -- Z_CCM_03
  name                VARCHAR(200) NOT NULL,
  description         TEXT,
  type                ENUM('DANGER','RESTRICTED','WARNING','SAFE','INFO') NOT NULL,
  severity            TINYINT      NOT NULL DEFAULT 3,    -- 1=info, 5=crítico
  polygon_2d          JSON         NOT NULL,
  z_min               DECIMAL(6,3) NOT NULL,
  z_max               DECIMAL(6,3) NOT NULL,
  buffer_approach_m   DECIMAL(4,2) DEFAULT 2.0,
  related_device_id   VARCHAR(50)  NULL,            -- FK soft a device_catalog del DT
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  display_color       VARCHAR(9),                   -- #RRGGBB(AA)
  action_on_entry     JSON,                         -- [{"channel":"HAPTIC","pattern":"WARNING"}, ...]
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by          VARCHAR(36),
  UNIQUE KEY uk_plant_code (plant_id, code),
  INDEX idx_plant_active (plant_id, is_active),
  INDEX idx_type (type)
);

-- -----------------------------------------------------------------------------
-- 3. pos_tags — dispositivos físicos de localización
-- -----------------------------------------------------------------------------
CREATE TABLE pos_tags (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  serial              VARCHAR(100) NOT NULL UNIQUE, -- ID que publica el tag (MAC o similar)
  model               VARCHAR(100),
  vendor              VARCHAR(100),
  firmware_version    VARCHAR(50),
  battery_last_pct    TINYINT,
  last_seen_at        TIMESTAMP    NULL,
  state               ENUM('ACTIVE','IDLE','LOW_BATTERY','LOST','UNKNOWN','DECOMMISSIONED') NOT NULL DEFAULT 'UNKNOWN',
  assigned_worker_id  BIGINT       NULL,
  assigned_at         TIMESTAMP    NULL,
  plant_id            VARCHAR(50)  NOT NULL,        -- FK soft a plants del DT
  notes               TEXT,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_worker_id) REFERENCES pos_workers(id) ON DELETE SET NULL,
  INDEX idx_serial   (serial),
  INDEX idx_assigned (assigned_worker_id),
  INDEX idx_plant    (plant_id),
  INDEX idx_state    (state)
);

-- -----------------------------------------------------------------------------
-- 4. pos_zone_permissions — qué roles pueden entrar a qué zonas
-- -----------------------------------------------------------------------------
CREATE TABLE pos_zone_permissions (
  zone_id    BIGINT      NOT NULL,
  role_code  VARCHAR(50) NOT NULL,
  PRIMARY KEY (zone_id, role_code),
  FOREIGN KEY (zone_id) REFERENCES pos_safety_zones(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 5. pos_zone_notification_policies — a quién avisar cuando se entra
-- -----------------------------------------------------------------------------
CREATE TABLE pos_zone_notification_policies (
  zone_id              BIGINT  PRIMARY KEY,
  notify_worker        BOOLEAN NOT NULL DEFAULT TRUE,    -- háptica al tag (canal HAPTIC_MQTT)
  notify_supervisor    BOOLEAN NOT NULL DEFAULT FALSE,   -- supervisor directo del worker (pos_workers.supervisor_user_id)
  notify_safety_team   BOOLEAN NOT NULL DEFAULT FALSE,   -- usuarios con ROLE_OPERATOR
  notify_all_managers  BOOLEAN NOT NULL DEFAULT FALSE,   -- todos los managers de la planta
  channel_in_app       BOOLEAN NOT NULL DEFAULT TRUE,
  channel_email        BOOLEAN NOT NULL DEFAULT FALSE,
  channel_haptic_mqtt  BOOLEAN NOT NULL DEFAULT TRUE,    -- solo aplica si notify_worker=TRUE
  custom_recipients    JSON    NULL,                     -- ["user_id_1", ...] override puntual
  FOREIGN KEY (zone_id) REFERENCES pos_safety_zones(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 6. pos_zone_schedules — horarios de activación de zonas
-- -----------------------------------------------------------------------------
CREATE TABLE pos_zone_schedules (
  id           BIGINT  AUTO_INCREMENT PRIMARY KEY,
  zone_id      BIGINT  NOT NULL,
  day_of_week  TINYINT NOT NULL,                          -- 1=lunes ... 7=domingo
  start_time   TIME    NOT NULL,
  end_time     TIME    NOT NULL,
  FOREIGN KEY (zone_id) REFERENCES pos_safety_zones(id) ON DELETE CASCADE,
  INDEX idx_zone (zone_id)
);

-- -----------------------------------------------------------------------------
-- 7. pos_proximity_events — registro de entradas/salidas
-- -----------------------------------------------------------------------------
CREATE TABLE pos_proximity_events (
  id                BIGINT       AUTO_INCREMENT PRIMARY KEY,
  worker_id         BIGINT       NULL,                    -- NULL si tag sin asignar
  tag_id            BIGINT       NOT NULL,
  zone_id           BIGINT       NOT NULL,
  plant_id          VARCHAR(50)  NOT NULL,
  entered_at        TIMESTAMP(3) NOT NULL,
  exited_at         TIMESTAMP(3) NULL,                    -- NULL mientras está dentro
  duration_sec      INT          GENERATED ALWAYS AS (
                                  CASE WHEN exited_at IS NOT NULL
                                    THEN TIMESTAMPDIFF(SECOND, entered_at, exited_at)
                                    ELSE NULL
                                  END
                                ) STORED,
  entry_point       JSON,                                 -- {x,y,z}
  exit_point        JSON,
  max_severity      TINYINT,
  actions_taken     JSON,                                 -- [{channel, pattern, ts}]
  authorized        BOOLEAN,                              -- worker tenía permiso para entrar?
  acknowledged_at   TIMESTAMP    NULL,
  acknowledged_by   VARCHAR(36),
  FOREIGN KEY (worker_id) REFERENCES pos_workers(id)       ON DELETE SET NULL,
  FOREIGN KEY (tag_id)    REFERENCES pos_tags(id),
  FOREIGN KEY (zone_id)   REFERENCES pos_safety_zones(id),
  INDEX idx_worker_entered (worker_id, entered_at DESC),
  INDEX idx_zone_entered   (zone_id,   entered_at DESC),
  INDEX idx_plant_entered  (plant_id,  entered_at DESC),
  INDEX idx_open_events    (exited_at, plant_id)          -- consultar eventos abiertos
);

-- -----------------------------------------------------------------------------
-- 8. pos_anchors — anchors UWB instalados (informativo en PoC)
-- -----------------------------------------------------------------------------
CREATE TABLE pos_anchors (
  id                BIGINT       AUTO_INCREMENT PRIMARY KEY,
  plant_id          VARCHAR(50)  NOT NULL,
  code              VARCHAR(50)  NOT NULL,                -- A_01
  serial            VARCHAR(100),
  pos_x             DECIMAL(10,4),                        -- coords en sistema IFC
  pos_y             DECIMAL(10,4),
  pos_z             DECIMAL(6,3),
  is_master         BOOLEAN      DEFAULT FALSE,
  last_seen_at      TIMESTAMP    NULL,
  firmware_version  VARCHAR(50),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  notes             TEXT,
  UNIQUE KEY uk_plant_code (plant_id, code),
  INDEX idx_plant (plant_id)
);

-- -----------------------------------------------------------------------------
-- 9. pos_plant_views — vistas (XKT 3D / floorplan 2D) por planta
-- -----------------------------------------------------------------------------
CREATE TABLE pos_plant_views (
  id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
  plant_id        VARCHAR(50)  NOT NULL,
  code            VARCHAR(50)  NOT NULL,                  -- GENERAL_3D, AREA_A_3D, FLOORPLAN_2D
  name            VARCHAR(200) NOT NULL,
  type            ENUM('FLOORPLAN_2D','MODEL_3D') NOT NULL,
  asset_url       VARCHAR(500) NOT NULL,                  -- /models/xxx.xkt o /floorplans/xxx.svg
  bbox            JSON,                                   -- {xmin,ymin,zmin,xmax,ymax,zmax}
  default_camera  JSON,                                   -- {eye,look,up} para 3D
  display_order   INT          DEFAULT 0,
  thumbnail_url   VARCHAR(500),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE KEY uk_plant_code (plant_id, code),
  INDEX idx_plant_active (plant_id, is_active)
);

-- -----------------------------------------------------------------------------
-- 10. pos_plant_settings — config por planta
-- -----------------------------------------------------------------------------
CREATE TABLE pos_plant_settings (
  plant_id                          VARCHAR(50) PRIMARY KEY,
  positioning_transform_matrix      JSON,                 -- matriz 4x4, default identidad cuando llegue HW real
  bbox                              JSON,                 -- bbox de la planta (validación)
  default_view_id                   BIGINT,               -- FK soft a pos_plant_views(id)
  mqtt_broker_url                   VARCHAR(500),
  mqtt_user                         VARCHAR(100),
  mqtt_pass_secret_ref              VARCHAR(200),         -- referencia a secret manager
  positions_history_retention_days  INT         DEFAULT 7,
  created_at                        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at                        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 11. pos_audit_log — auditoría (GDPR)
-- -----------------------------------------------------------------------------
CREATE TABLE pos_audit_log (
  id             BIGINT       AUTO_INCREMENT PRIMARY KEY,
  ts             TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  user_id        VARCHAR(36),
  action         VARCHAR(100),                            -- VIEW_POSITIONS, EXPORT_EVENTS, ...
  resource_type  VARCHAR(50),
  resource_id    VARCHAR(200),
  details        JSON,
  ip_address     VARCHAR(45),
  INDEX idx_user_ts   (user_id, ts DESC),
  INDEX idx_action_ts (action,  ts DESC)
);

-- -----------------------------------------------------------------------------
-- Seed mínimo: planta piloto TSP3 + vista del modelo XKT existente
-- -----------------------------------------------------------------------------
INSERT INTO pos_plant_settings (plant_id, positioning_transform_matrix, positions_history_retention_days)
VALUES ('TSP3', JSON_OBJECT('m', JSON_ARRAY(1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1)), 7);

INSERT INTO pos_plant_views (plant_id, code, name, type, asset_url, display_order, is_active)
VALUES ('TSP3', 'GENERAL_3D', 'Vista general 3D', 'MODEL_3D', '/models/prueba_paco3.xkt', 0, TRUE);
