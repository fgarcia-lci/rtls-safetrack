-- =============================================================================
-- RTLS Safetrack — Flyway V4: zonas de seguridad seed para la planta TSP3
--
-- Crea 2 zonas DANGER en coordenadas mundiales del modelo solubilizacion_v1
-- (X≈-2465133..-2464901, Y≈32235034..32235242 en convención top-down) para
-- que el ZoneEngineService tenga algo contra lo que evaluar en cuanto se
-- ponga en marcha. Coinciden con áreas por las que los waypoints del
-- simulador hacen pasar a varios trabajadores → es trivial provocar entradas
-- y aproximaciones.
--
-- Polygon_2d: array de [x, y] en orden, polígono cerrado (no se repite el
-- primer vértice).
-- z_min/z_max: prisma vertical entre 64.0 y 80.0 m (suelo del modelo a 64.22).
-- buffer_approach_m: 3.0 m → empieza el estado APPROACHING a 3 m del borde.
-- =============================================================================

INSERT INTO pos_safety_zones (
  plant_id, code, name, description,
  type, severity, polygon_2d, z_min, z_max,
  buffer_approach_m, is_active, display_color, created_by
) VALUES (
  'TSP3',
  'Z_CCM_03',
  'CCM-3 Eléctrico',
  'Cuadro de control de motores 3 — riesgo eléctrico, solo personal autorizado.',
  'DANGER',
  5,
  '[[-2465088,32235070],[-2465048,32235070],[-2465048,32235110],[-2465088,32235110]]',
  64.000,
  80.000,
  3.00,
  TRUE,
  '#e63939',
  'system'
);

INSERT INTO pos_safety_zones (
  plant_id, code, name, description,
  type, severity, polygon_2d, z_min, z_max,
  buffer_approach_m, is_active, display_color, created_by
) VALUES (
  'TSP3',
  'Z_MOLINO_01',
  'Molino Granulación',
  'Zona del molino de granulación — atrapamiento por partes móviles.',
  'DANGER',
  4,
  '[[-2464980,32235160],[-2464930,32235160],[-2464930,32235210],[-2464980,32235210]]',
  64.000,
  80.000,
  3.00,
  TRUE,
  '#e63939',
  'system'
);

-- Default notification policy para ambas: háptica al operario + IN_APP al
-- panel (sin email ni supervisores en PoC).
INSERT INTO pos_zone_notification_policies (
  zone_id, notify_worker, notify_supervisor, notify_safety_team,
  notify_all_managers, channel_in_app, channel_email, channel_haptic_mqtt
)
SELECT id, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE
  FROM pos_safety_zones
 WHERE plant_id = 'TSP3'
   AND code IN ('Z_CCM_03', 'Z_MOLINO_01');
