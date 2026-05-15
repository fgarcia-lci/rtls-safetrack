package com.lci.rtls.positioning.plantview.dto;

/**
 * Admin-editable calibration values for a plant-view. All fields optional —
 * a null value means "leave unchanged"; passing the value explicitly (even
 * 0.0) updates it. The whole object replaces the relevant columns.
 */
public record PlantViewCalibrationRequest(
        Double defaultYOffset,
        Double defaultAvatarHeightM,
        /** Whole defaultCamera JSON ({"eye":[..],"look":[..],"up":[..]}). */
        String defaultCamera
) {}
