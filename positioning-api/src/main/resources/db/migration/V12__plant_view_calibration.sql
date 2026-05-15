-- Per-plant_view calibration data. These values describe how the model
-- should be displayed by default for everyone (offset Y to align the model
-- floor with the world Z=0, default avatar height in meters). Only ADMINs
-- can change them. `default_camera` already existed in V2.

ALTER TABLE pos_plant_views
    ADD COLUMN default_y_offset DOUBLE NULL AFTER default_camera,
    ADD COLUMN default_avatar_height_m DOUBLE NULL AFTER default_y_offset;
