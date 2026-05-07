-- =============================================================================
-- RTLS Safetrack — Flyway V8: separar conceptos "desactivar" y "borrar".
--
-- Hasta ahora `is_active` se usaba para ambas cosas (DELETE endpoint hacía
-- soft-delete vía is_active=FALSE). Eso colisionaba con el toggle de
-- estado del editor.
--
-- Ahora:
--   - is_active           → toggle Activar/Desactivar (zona en lista, no
--                           se evalúa cuando inactive). Cambia en caliente.
--   - deleted_at NOT NULL → borrado lógico (zona fuera del listado y del
--                           motor de proximidad). Recuperable por admin
--                           con UPDATE manual; futura UI puede mostrar
--                           papelera de zonas borradas.
-- =============================================================================

ALTER TABLE pos_safety_zones
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER is_active;

CREATE INDEX idx_pos_safety_zones_deleted_at
  ON pos_safety_zones (deleted_at);
