-- =============================================================================
-- RTLS Safetrack — Flyway V2: layers en pos_plant_views
--
-- Soporta múltiples XKT por vista (disciplinas: estructura, instalaciones,
-- máquinas, arquitectura...). El frontend carga cada layer en el mismo viewer
-- xeokit y permite show/hide individual.
--
-- pos_plant_views.asset_url se mantiene como FALLBACK — si una vista no tiene
-- layers definidas, el frontend usa asset_url como única layer implícita.
-- =============================================================================

CREATE TABLE pos_plant_view_layers (
  id               BIGINT       AUTO_INCREMENT PRIMARY KEY,
  plant_view_id    BIGINT       NOT NULL,
  code             VARCHAR(50)  NOT NULL,             -- STRUCTURE, MEP, MACHINES, ARCH, ALL...
  name             VARCHAR(200) NOT NULL,
  asset_url        VARCHAR(500) NOT NULL,             -- /models/<vista>/<disciplina>.xkt
  default_visible  BOOLEAN      NOT NULL DEFAULT TRUE,
  display_order    INT          DEFAULT 0,
  display_color    VARCHAR(9),                        -- color sugerido para chips/UI (#RRGGBB)
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plant_view_id) REFERENCES pos_plant_views(id) ON DELETE CASCADE,
  UNIQUE KEY uk_view_layer (plant_view_id, code),
  INDEX idx_view_active (plant_view_id, is_active)
);

-- Seed: convierte la vista GENERAL_3D existente de TSP3 en una single-layer
-- usando el mismo prueba_paco3.xkt. Cuando Paco exporte por disciplinas,
-- añade más filas con INSERT manuales o vía UI futura.
INSERT INTO pos_plant_view_layers (plant_view_id, code, name, asset_url, default_visible, display_order)
SELECT id, 'ALL', 'Vista completa', '/models/prueba_paco3.xkt', TRUE, 0
  FROM pos_plant_views
 WHERE plant_id = 'TSP3' AND code = 'GENERAL_3D';
