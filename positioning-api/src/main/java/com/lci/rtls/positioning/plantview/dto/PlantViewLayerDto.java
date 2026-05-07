package com.lci.rtls.positioning.plantview.dto;

import com.lci.rtls.positioning.plantview.PlantViewLayer;

public record PlantViewLayerDto(
        Long id,
        String code,
        String name,
        String assetUrl,
        boolean defaultVisible,
        Integer displayOrder,
        String displayColor
) {
    public static PlantViewLayerDto from(PlantViewLayer l) {
        return new PlantViewLayerDto(
                l.getId(),
                l.getCode(),
                l.getName(),
                l.getAssetUrl(),
                l.isDefaultVisible(),
                l.getDisplayOrder(),
                l.getDisplayColor()
        );
    }
}
