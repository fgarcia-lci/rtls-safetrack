-- =============================================================================
-- RTLS Safetrack — Flyway V3: cambia el XKT por defecto de TSP3
--
-- Sustituye prueba_paco3.xkt (placeholder inicial de Fase 0) por
-- solubilizacion_v1.xkt, que es el modelo real con el que se va a probar.
-- Sigue siendo single-layer; cuando se exporten más disciplinas se añaden
-- como filas nuevas en pos_plant_view_layers.
-- =============================================================================

-- 1. Ruta del asset principal (campo legacy / fallback de la vista)
UPDATE pos_plant_views
   SET asset_url = '/models/solubilizacion_v1.xkt'
 WHERE plant_id = 'TSP3'
   AND code = 'GENERAL_3D'
   AND asset_url = '/models/prueba_paco3.xkt';

-- 2. Layer 'ALL' creada en V2 (single-layer "Vista completa")
UPDATE pos_plant_view_layers l
   JOIN pos_plant_views v ON v.id = l.plant_view_id
    SET l.asset_url = '/models/solubilizacion_v1.xkt'
  WHERE v.plant_id = 'TSP3'
    AND v.code = 'GENERAL_3D'
    AND l.code = 'ALL'
    AND l.asset_url = '/models/prueba_paco3.xkt';
