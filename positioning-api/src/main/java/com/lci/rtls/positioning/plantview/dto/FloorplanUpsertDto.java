package com.lci.rtls.positioning.plantview.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for create/update of a {@code FLOORPLAN_2D} plant view.
 *
 * <p>The SVG content travels inline as a string (it's text). The world bbox
 * is what the admin reads from LibreCAD/Inkscape (Properties → Bounding Box)
 * after generating the SVG from Revit's DXF export. {@code svgFlipY} is true
 * for CAD-style Y-up exports (default).
 */
public record FloorplanUpsertDto(
        @NotBlank @Size(max = 50) String plantId,
        @NotBlank @Size(max = 50) String code,
        @NotBlank @Size(max = 200) String name,
        @NotBlank String svgContent,
        @NotNull Double worldBboxMinX,
        @NotNull Double worldBboxMinY,
        @NotNull Double worldBboxMaxX,
        @NotNull Double worldBboxMaxY,
        Boolean svgFlipY,
        Integer displayOrder,
        Boolean isActive
) {}
