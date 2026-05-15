-- =============================================================================
-- RTLS Safetrack — Flyway V10: eventos SOS / botón de pánico
--
-- El operario lleva un tag con botón físico de pánico. Al pulsarlo el firmware
-- publica un mensaje MQTT en sim/v1/plant/{plantId}/tag/{tagId}/sos. El backend
-- crea una fila en esta tabla, dispara TODOS los canales con severidad MÁXIMA
-- y notifica al frontend por WebSocket.
--
-- Modelo separado de pos_proximity_events porque:
--   - Naturaleza distinta: no es entrada en zona, es petición explícita
--   - Política de notificación es siempre "todos los canales, severity máxima"
--   - Ciclo de vida: REQUESTED → ACKED (alguien lo vio) → HELP_SENT (ayuda enviada)
--                    → RESOLVED (situación cerrada) / CANCELLED (falso positivo)
--   - Cancelación posible pero el registro nunca se borra (auditoría)
-- =============================================================================

CREATE TABLE pos_sos_events (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,

    -- Quién lo disparó
    worker_id         BIGINT NULL,         -- FK pos_workers.id (NULL si tag sin asignar)
    tag_id            BIGINT NOT NULL,     -- FK pos_tags.id
    plant_id          VARCHAR(50) NOT NULL,

    -- Cuándo y dónde
    triggered_at      DATETIME(3) NOT NULL,
    triggered_point   JSON NULL,           -- {x, y, z} última posición conocida al pulsar
    zones_at_trigger  JSON NULL,           -- [zone_id, zone_id, ...] zonas en las que estaba
    nearby_worker_ids JSON NULL,           -- [worker_id, ...] otros operarios cercanos (<10m)

    -- Ciclo de vida
    status            VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
                                            -- REQUESTED, ACKED, HELP_SENT, RESOLVED, CANCELLED
    acked_at          DATETIME(3) NULL,
    acked_by          VARCHAR(36) NULL,
    help_sent_at      DATETIME(3) NULL,
    help_sent_by      VARCHAR(36) NULL,
    help_notes        TEXT NULL,            -- "Brigada en camino", "Encargado avisado", etc.
    resolved_at       DATETIME(3) NULL,
    resolved_by       VARCHAR(36) NULL,
    resolution_notes  TEXT NULL,
    cancelled_at      DATETIME(3) NULL,
    cancelled_by      VARCHAR(36) NULL,
    cancel_reason     TEXT NULL,            -- "Falso positivo", "Botón presionado sin querer"

    -- Resumen acciones disparadas (para auditoría)
    actions_taken     JSON NULL,            -- [{channel, ts, recipient_id}, ...]

    INDEX idx_sos_plant_status (plant_id, status),
    INDEX idx_sos_worker (worker_id),
    INDEX idx_sos_tag (tag_id),
    INDEX idx_sos_triggered (triggered_at)
);
