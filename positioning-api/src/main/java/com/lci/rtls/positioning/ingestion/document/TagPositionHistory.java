package com.lci.rtls.positioning.ingestion.document;

import com.lci.rtls.positioning.mqtt.model.PositionEvent;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Histórico de lecturas de posición a 1 Hz. Cada documento es una muestra.
 * TTL de 48h sobre {@code ts} — Mongo borra automáticamente las lecturas viejas.
 */
@Document(collection = "tag_positions_history")
@CompoundIndexes({
        @CompoundIndex(name = "idx_plant_ts", def = "{'plantId': 1, 'ts': -1}"),
        @CompoundIndex(name = "idx_tag_ts",   def = "{'tagId': 1, 'ts': -1}")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TagPositionHistory {

    @Id
    private String id;

    private String tagId;
    private String plantId;

    /** Campo TTL: Mongo borra los documentos cuya {@code ts} sea más vieja que 48h. */
    @Indexed(expireAfter = "48h")
    private Instant ts;

    private double x;
    private double y;
    private double z;

    private Double accuracyM;
    private PositionEvent.Quality quality;
}
