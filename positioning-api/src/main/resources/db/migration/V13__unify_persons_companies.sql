-- =============================================================================
-- RTLS Safetrack — Flyway V13: unificar pos_workers en pos_persons
--
-- Cambio conceptual:
--   - pos_workers se renombra a pos_persons (una persona puede ser trabajador,
--     supervisor, manager de empresa, o varios de esos a la vez).
--   - Nuevas tablas pos_companies (empresas con manager) y pos_notification_log
--     (auditoría de a quién avisamos cuando saltó una alerta).
--   - Las FK existentes que apuntaban a pos_workers se preservan automáticamente
--     por InnoDB tras el RENAME (referencias resueltas por nombre de tabla
--     actualizado). Columnas con `worker_id`/`assigned_worker_id` se renombran
--     para coherencia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Rename pos_workers → pos_persons
-- -----------------------------------------------------------------------------
RENAME TABLE pos_workers TO pos_persons;

-- -----------------------------------------------------------------------------
-- 2) Nuevas columnas en pos_persons (flags + relaciones + PRL)
-- -----------------------------------------------------------------------------
ALTER TABLE pos_persons
  ADD COLUMN is_worker_in_plant     TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Si TRUE → la persona aparece en la lista de trabajadores y se le puede asignar tag',
  ADD COLUMN is_supervisor          TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Si TRUE → aparece en dropdowns "supervisor de trabajador"',
  ADD COLUMN is_company_manager     TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Si TRUE → aparece en dropdowns "manager de empresa"',
  ADD COLUMN supervisor_id          BIGINT NULL
    COMMENT 'Supervisor primario (self-FK a pos_persons donde is_supervisor=1)',
  ADD COLUMN backup_supervisor_id   BIGINT NULL
    COMMENT 'Supervisor de respaldo si el primario no contesta',
  ADD COLUMN company_id             BIGINT NULL
    COMMENT 'Empresa de la persona (FK a pos_companies). Si NULL la persona no está asociada.',
  ADD COLUMN last_prl_training_date DATE NULL
    COMMENT 'Última fecha del curso PRL completado por el trabajador',
  ADD COLUMN prl_valid_months       INT NOT NULL DEFAULT 12
    COMMENT 'Meses de validez del curso PRL. Si hoy > last_prl_training_date + N meses → caducado',
  ADD COLUMN supervisor_notes       TEXT NULL
    COMMENT 'Notas internas del supervisor sobre la persona (no visibles al trabajador)';

-- Backfill: las filas existentes son todas trabajadores
UPDATE pos_persons SET is_worker_in_plant = 1 WHERE is_worker_in_plant IS NULL;

-- FK self-referencial para supervisor / backup
ALTER TABLE pos_persons
  ADD CONSTRAINT fk_person_supervisor
    FOREIGN KEY (supervisor_id)        REFERENCES pos_persons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_person_backup_supervisor
    FOREIGN KEY (backup_supervisor_id) REFERENCES pos_persons(id) ON DELETE SET NULL,
  ADD INDEX idx_person_is_worker     (is_worker_in_plant),
  ADD INDEX idx_person_is_supervisor (is_supervisor),
  ADD INDEX idx_person_is_manager    (is_company_manager),
  ADD INDEX idx_person_supervisor    (supervisor_id),
  ADD INDEX idx_person_company       (company_id),
  ADD INDEX idx_person_prl_date      (last_prl_training_date);

-- -----------------------------------------------------------------------------
-- 3) pos_companies — empresas con manager obligatorio (a nivel app)
-- -----------------------------------------------------------------------------
CREATE TABLE pos_companies (
  id                BIGINT       AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(120) NOT NULL UNIQUE,
  type              ENUM('INTERNAL','CONTRACTOR','VISITOR') NOT NULL,
  manager_person_id BIGINT       NULL
    COMMENT 'Manager principal de la empresa (FK a pos_persons donde is_company_manager=1). Validado a nivel app — no NOT NULL aquí por flexibilidad de seed.',
  manager_notes     TEXT         NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_company_manager
    FOREIGN KEY (manager_person_id) REFERENCES pos_persons(id) ON DELETE SET NULL,
  INDEX idx_company_type   (type),
  INDEX idx_company_active (is_active)
);

-- FK company_id en pos_persons (ya añadida la columna arriba)
ALTER TABLE pos_persons
  ADD CONSTRAINT fk_person_company
    FOREIGN KEY (company_id) REFERENCES pos_companies(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 4) Renombrar columnas worker_id → person_id en tablas dependientes
--    InnoDB preserva FK y el índice asociado durante CHANGE COLUMN. No
--    intentamos DROP+ADD del índice porque MySQL bloquea quitar un índice
--    que sostiene un FK activo (errno 1553).
-- -----------------------------------------------------------------------------
ALTER TABLE pos_tags
  CHANGE COLUMN assigned_worker_id assigned_person_id BIGINT NULL;

ALTER TABLE pos_proximity_events
  CHANGE COLUMN worker_id person_id BIGINT NULL;

ALTER TABLE pos_sos_events
  CHANGE COLUMN worker_id person_id BIGINT NULL;

-- nearby_worker_ids es JSON, no es FK — sólo se renombra el campo lógico.
-- Como es un JSON opaco no afecta a SQL; la app actualizará la clave si la
-- está leyendo (se documenta en código).

-- -----------------------------------------------------------------------------
-- 5) pos_notification_log — auditoría de notificaciones enviadas
-- -----------------------------------------------------------------------------
CREATE TABLE pos_notification_log (
  id                  BIGINT       AUTO_INCREMENT PRIMARY KEY,
  ts                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  event_kind          ENUM('PROXIMITY_ENTER','PROXIMITY_EXIT','SOS','ACK','OTHER') NOT NULL,
  event_id            BIGINT       NULL
    COMMENT 'FK lógico al evento (proximity_event.id o sos_event.id según event_kind). No declarado como FK porque apunta a tablas distintas.',
  zone_id             BIGINT       NULL
    COMMENT 'Zona involucrada si aplica',
  plant_id            VARCHAR(50)  NOT NULL,
  recipient_person_id BIGINT       NOT NULL,
  recipient_role      ENUM('WORKER','SUPERVISOR','BACKUP_SUPERVISOR','COMPANY_MANAGER','SAFETY','MANAGERS','OTHER') NOT NULL,
  channel             ENUM('IN_APP','EMAIL','HAPTIC_MQTT','SMS','PUSH') NOT NULL,
  status              ENUM('SENT','FAILED','SKIPPED') NOT NULL,
  reason              VARCHAR(200) NULL
    COMMENT 'Para FAILED/SKIPPED: por qué',
  CONSTRAINT fk_notiflog_recipient
    FOREIGN KEY (recipient_person_id) REFERENCES pos_persons(id),
  INDEX idx_notiflog_event       (event_kind, event_id),
  INDEX idx_notiflog_recipient   (recipient_person_id, ts DESC),
  INDEX idx_notiflog_plant_ts    (plant_id, ts DESC),
  INDEX idx_notiflog_zone_ts     (zone_id,  ts DESC)
);

-- -----------------------------------------------------------------------------
-- 6) Limpieza: supervisor_user_id queda obsoleto (apuntaba a users del DT por
--    string). Lo dejamos por compatibilidad pero marcado en el comentario; el
--    código nuevo usa supervisor_id (FK a pos_persons).
-- -----------------------------------------------------------------------------
ALTER TABLE pos_persons
  MODIFY COLUMN supervisor_user_id VARCHAR(36) NULL
    COMMENT 'DEPRECATED: se reemplaza por supervisor_id (FK pos_persons). Se elimina en V14+.';
