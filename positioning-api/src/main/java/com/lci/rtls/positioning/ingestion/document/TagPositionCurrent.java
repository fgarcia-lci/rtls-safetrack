package com.lci.rtls.positioning.ingestion.document;

import com.lci.rtls.positioning.mqtt.model.PositionEvent;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Posición actual de un tag (1 documento por tag, upsert).
 * Sin TTL: se elimina solo cuando el tag se da de baja explícitamente.
 */
@Document(collection = "tag_positions_current")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TagPositionCurrent {

    /** _id = tag_id (string) — un documento por tag. */
    @Id
    private String tagId;

    @Indexed
    private String plantId;

    private Instant ts;

    /** Coordenadas (x, y, z) en metros. */
    private double x;
    private double y;
    private double z;

    private Double accuracyM;
    private PositionEvent.Quality quality;
    private PositionEvent.Source source;
    private Long seq;

    @Indexed
    private Instant updatedAt;
}
