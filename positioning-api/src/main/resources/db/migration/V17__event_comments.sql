-- V17: tabla unificada de comentarios sobre eventos (proximity + SOS).
--
-- Permite que supervisores/operadores añadan notas libres a un evento ya
-- cerrado (post-mortem, lecciones aprendidas, contexto adicional). Inmutables
-- — solo se añaden, nunca se editan ni borran. Auditoría permanente.

CREATE TABLE pos_event_comments (
    id               BIGINT          NOT NULL AUTO_INCREMENT,
    event_type       VARCHAR(20)     NOT NULL,
    event_id         BIGINT          NOT NULL,
    author_username  VARCHAR(150)    NOT NULL,
    author_display   VARCHAR(200)    NULL,
    comment_text     TEXT            NOT NULL,
    created_at       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    INDEX idx_event_comments_lookup (event_type, event_id, created_at),
    CONSTRAINT chk_event_comments_type CHECK (event_type IN ('PROXIMITY','SOS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
