-- =============================================================================
-- RTLS Safetrack — Flyway V5: reposicionar las zonas seed sobre equipos del
-- modelo solubilizacion_v1 en lugar de las posiciones iniciales (que caían
-- en huecos sin equipo).
--
-- Coordenadas elegidas observando el AABB del modelo (X: -2465133..-2464901,
-- Y_horizontal: 32235034..32235242) y los waypoints del simulador, de forma
-- que las zonas:
--   - Caigan sobre clusters de equipo industrial visibles.
--   - Queden a tiro de los waypoints de los workers para que la demo dispare
--     entradas con frecuencia.
-- Si no encajan visualmente, basta con un nuevo UPDATE para ajustar polígonos.
-- =============================================================================

-- 1) CCM Eléctrico: esquina superior izquierda, donde están las columnas
--    eléctricas / tableros del modelo.
UPDATE pos_safety_zones
   SET polygon_2d = '[[-2465118,32235048],[-2465078,32235048],[-2465078,32235078],[-2465118,32235078]]',
       name        = 'CCM-3 Eléctrico',
       description = 'Cuadro de control de motores 3 — riesgo eléctrico, solo personal autorizado.'
 WHERE plant_id = 'TSP3' AND code = 'Z_CCM_03';

-- 2) Molino Granulación: cluster central de maquinaria.
UPDATE pos_safety_zones
   SET polygon_2d = '[[-2465040,32235135],[-2464985,32235135],[-2464985,32235180],[-2465040,32235180]]',
       name        = 'Molino Granulación',
       description = 'Zona del molino de granulación — atrapamiento por partes móviles.'
 WHERE plant_id = 'TSP3' AND code = 'Z_MOLINO_01';

-- 3) Reactor Solubilización (NUEVO): zona derecha-superior, donde se ven
--    las torres/columnas verticales del modelo.
INSERT INTO pos_safety_zones (
  plant_id, code, name, description,
  type, severity, polygon_2d, z_min, z_max,
  buffer_approach_m, is_active, display_color, created_by
) VALUES (
  'TSP3',
  'Z_REACTOR_01',
  'Reactor Solubilización',
  'Reactor químico — alta temperatura y presión, prohibida estancia prolongada.',
  'DANGER',
  5,
  '[[-2464975,32235068],[-2464932,32235068],[-2464932,32235108],[-2464975,32235108]]',
  64.000,
  120.000,
  3.50,
  TRUE,
  '#e63939',
  'system'
)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 4) Cinta Transportadora (NUEVO): zona inferior, equipos de transporte de
--    producto entre granulación y empaque.
INSERT INTO pos_safety_zones (
  plant_id, code, name, description,
  type, severity, polygon_2d, z_min, z_max,
  buffer_approach_m, is_active, display_color, created_by
) VALUES (
  'TSP3',
  'Z_CINTA_01',
  'Cinta Transportadora',
  'Cinta transportadora — riesgo de atrapamiento, no aproximarse en marcha.',
  'DANGER',
  4,
  '[[-2465080,32235195],[-2465000,32235195],[-2465000,32235215],[-2465080,32235215]]',
  64.000,
  72.000,
  2.50,
  TRUE,
  '#e63939',
  'system'
)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 5) Notification policies por defecto para las dos zonas nuevas (háptica
--    al operario + IN_APP al panel, sin email/escalado).
INSERT INTO pos_zone_notification_policies (
  zone_id, notify_worker, notify_supervisor, notify_safety_team,
  notify_all_managers, channel_in_app, channel_email, channel_haptic_mqtt
)
SELECT id, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE
  FROM pos_safety_zones
 WHERE plant_id = 'TSP3'
   AND code IN ('Z_REACTOR_01', 'Z_CINTA_01')
   AND id NOT IN (SELECT zone_id FROM pos_zone_notification_policies);
