-- Per-user UI preferences for the 3D viewer (and other views) per plant-view.
-- Stored as a JSON blob to avoid schema churn as the front evolves. The
-- frontend reads/writes the whole blob; backend just persists.
--
-- Keyed by (username, plant_view_id). `username` = `Authentication.getName()`
-- = JWT subject (`sub` claim). Same identity as used elsewhere in the API.

CREATE TABLE pos_user_view_pref (
  id              BIGINT NOT NULL AUTO_INCREMENT,
  username        VARCHAR(150) NOT NULL,
  plant_view_id   BIGINT NOT NULL,
  prefs_json      JSON NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_plant_view (username, plant_view_id),
  KEY idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
