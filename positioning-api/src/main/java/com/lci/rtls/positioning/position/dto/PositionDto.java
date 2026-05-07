package com.lci.rtls.positioning.position.dto;

import com.lci.rtls.positioning.ingestion.document.TagPositionCurrent;
import com.lci.rtls.positioning.mqtt.model.PositionEvent;

import java.time.Instant;

/**
 * DTO de respuesta del endpoint REST {@code GET /api/v1/positions/current}.
 * Plano (sin objetos anidados) para que sea cómodo de consumir desde el frontend.
 */
public record PositionDto(
        String tagId,
        String plantId,
        Instant ts,
        double x,
        double y,
        double z,
        Double accuracyM,
        PositionEvent.Quality quality,
        PositionEvent.Source source,
        Long seq,
        Instant updatedAt
) {

    public static PositionDto from(TagPositionCurrent doc) {
        return new PositionDto(
                doc.getTagId(),
                doc.getPlantId(),
                doc.getTs(),
                doc.getX(),
                doc.getY(),
                doc.getZ(),
                doc.getAccuracyM(),
                doc.getQuality(),
                doc.getSource(),
                doc.getSeq(),
                doc.getUpdatedAt()
        );
    }
}
