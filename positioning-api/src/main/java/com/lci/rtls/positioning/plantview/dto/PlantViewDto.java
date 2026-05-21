package com.lci.rtls.positioning.plantview.dto;

import com.lci.rtls.positioning.plantview.PlantView;

import java.util.List;

public record PlantViewDto(
        Long id,
        String plantId,
        String code,
        String name,
        PlantView.Type type,
        /** Asset principal — fallback cuando no hay layers (vista mono-XKT). */
        String assetUrl,
        String bbox,
        String defaultCamera,
        Double defaultYOffset,
        Double defaultAvatarHeightM,
        Integer displayOrder,
        String thumbnailUrl,
        /** FLOORPLAN_2D: world bbox of the SVG (meters). Null for MODEL_3D. */
        Double worldBboxMinX,
        Double worldBboxMinY,
        Double worldBboxMaxX,
        Double worldBboxMaxY,
        boolean svgFlipY,
        boolean isActive,
        /** Lista de layers (XKTs por disciplina). Vacía si la vista es single-asset. */
        List<PlantViewLayerDto> layers
) {
    public static PlantViewDto from(PlantView pv, List<PlantViewLayerDto> layers) {
        return new PlantViewDto(
                pv.getId(),
                pv.getPlantId(),
                pv.getCode(),
                pv.getName(),
                pv.getType(),
                pv.getAssetUrl(),
                pv.getBbox(),
                pv.getDefaultCamera(),
                pv.getDefaultYOffset(),
                pv.getDefaultAvatarHeightM(),
                pv.getDisplayOrder(),
                pv.getThumbnailUrl(),
                pv.getWorldBboxMinX(),
                pv.getWorldBboxMinY(),
                pv.getWorldBboxMaxX(),
                pv.getWorldBboxMaxY(),
                pv.isSvgFlipY(),
                pv.isActive(),
                layers
        );
    }
}
