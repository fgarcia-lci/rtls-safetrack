-- V15: storage and calibration for FLOORPLAN_2D plant views.
--
-- The 2D viewer reads its background SVG from this row. We keep the SVG
-- content inline (LONGTEXT) so we don't need a shared volume between
-- positioning-api and positioning-frontend, and so backup is atomic.
--
-- Convention: the SVG ships in world meters (admin generates it from Revit
-- via DXF + LibreCAD, keeping unit = m). The world bbox below tells the
-- viewer where the SVG sits in plant coordinates; svg_flip_y is true for
-- CAD-style Y-up exports (the browser SVG Y axis is inverted by transform
-- at render time).
ALTER TABLE pos_plant_views
    ADD COLUMN svg_content       LONGTEXT       NULL        AFTER asset_url,
    ADD COLUMN world_bbox_min_x  DECIMAL(12,3)  NULL        AFTER svg_content,
    ADD COLUMN world_bbox_min_y  DECIMAL(12,3)  NULL        AFTER world_bbox_min_x,
    ADD COLUMN world_bbox_max_x  DECIMAL(12,3)  NULL        AFTER world_bbox_min_y,
    ADD COLUMN world_bbox_max_y  DECIMAL(12,3)  NULL        AFTER world_bbox_max_x,
    ADD COLUMN svg_flip_y        BOOLEAN        NOT NULL DEFAULT TRUE  AFTER world_bbox_max_y;
