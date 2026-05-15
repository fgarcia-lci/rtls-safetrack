-- =============================================================================
-- RTLS Safetrack — Flyway V9: cambia el XKT de TSP3 a edificios2x3.xkt
--
-- Sustituye solubilizacion_v1.xkt (V3) por edificios2x3.xkt para pruebas.
-- Sigue siendo single-layer (la fila 'ALL' creada en V2).
--
-- ATENCIÓN: las zonas existentes en pos_safety_zones siguen apuntando a
-- coordenadas mundiales del modelo solubilizacion_v1 (~(-2.46M, 32.23M)).
-- Si el nuevo modelo está en otras coordenadas, esas zonas no caerán
-- sobre la geometría. Se pueden:
--   (a) borrar y recrear con el editor sobre el nuevo modelo
--   (b) trasladar con un UPDATE masivo si conoces el offset
-- Esta migración NO toca pos_safety_zones — se deja a decisión manual.
--
-- También se RESETEA el `bbox` de la plant-view (calculado en V7
-- para solubilizacion_v1) para que el preview del editor recompute con
-- el AABB real del nuevo modelo al volver a abrirlo.
-- =============================================================================

-- 1. Asset URL principal de la vista (fallback)
UPDATE pos_plant_views
   SET asset_url = '/models/edificios2x3.xkt'
 WHERE plant_id = 'TSP3'
   AND code = 'GENERAL_3D';

-- 2. Layer 'ALL' (la única definida hoy)
UPDATE pos_plant_view_layers l
   JOIN pos_plant_views v ON v.id = l.plant_view_id
    SET l.asset_url = '/models/edificios2x3.xkt'
  WHERE v.plant_id = 'TSP3'
    AND v.code = 'GENERAL_3D'
    AND l.code = 'ALL';

-- 3. Bbox cacheado de la vista — invalidar (lo recalcula el frontend
--    cuando carga el modelo nuevo).
UPDATE pos_plant_views
   SET bbox = NULL
 WHERE plant_id = 'TSP3'
   AND code = 'GENERAL_3D';
