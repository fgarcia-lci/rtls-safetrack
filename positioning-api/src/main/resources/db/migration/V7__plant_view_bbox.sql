-- =============================================================================
-- RTLS Safetrack — Flyway V7: poblar pos_plant_views.bbox para TSP3.
--
-- bbox = AABB del XKT en coords mundiales reales, formato JSON
--   [minX, minY, minZ, maxX, maxY, maxZ]   (convención xeokit Y-up).
--
-- Estos valores se observaron empíricamente en los logs del visor 3D
-- (model.aabb del XKT solubilizacion_v1) — ver gotcha #16. Lo necesita
-- el editor de zonas para mostrar el footprint del modelo como
-- referencia top-down al crear/mover zonas.
-- =============================================================================

UPDATE pos_plant_views
   SET bbox = '[-2465133.66, 64.22, 32235034.74, -2464901.46, 163.42, 32235242.05]'
 WHERE plant_id = 'TSP3'
   AND code = 'GENERAL_3D'
   AND bbox IS NULL;
