-- =============================================================================
-- RTLS Safetrack — Flyway V6: añade shape_type a pos_safety_zones.
--
-- shape_type es METADATA: indica con qué primitiva se creó la zona en el
-- editor 3D (#40) — POLYGON (click-a-click), BOX (cubo manipulado por
-- gizmos) o CYLINDER (radio + altura). La geometría canónica sigue siendo
-- polygon_2d + zMin/zMax — un cilindro se almacena como polígono de N
-- segmentos aproximando el círculo, y un box como polígono de 4 vértices.
-- shape_type permite al editor reconstruir el manipulador correcto cuando
-- el usuario abre una zona para editarla.
-- =============================================================================

ALTER TABLE pos_safety_zones
  ADD COLUMN shape_type ENUM('POLYGON','BOX','CYLINDER') NOT NULL DEFAULT 'POLYGON'
  AFTER type;

-- Las zonas seed insertadas en V4/V5 son polígonos rectangulares, así que
-- al setear default POLYGON ya quedan correctas. Si en el futuro alguna
-- es realmente un BOX/CYLINDER conceptualmente, se actualiza con UPDATE.
