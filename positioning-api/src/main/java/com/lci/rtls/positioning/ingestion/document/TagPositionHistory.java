package com.lci.rtls.positioning.ingestion.document;

import com.lci.rtls.positioning.mqtt.model.PositionEvent;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Histórico de lecturas de posición a 1 Hz. Cada documento es una muestra.
 *
 * <p>TTL configurable vía {@code rtls.retention.positions-history-days}
 * (default 7 días). Mongo aplica el TTL index al arrancar la app — al
 * cambiar el valor y reiniciar, el índice se recrea con la nueva expiración.
 *
 * <p>Aumentar la retención permite vistas de histórico más profundas
 * (ficha de trabajador, replay temporal, heatmaps) a coste de almacenamiento
 * (con 30 personas a 1 Hz, una semana ≈ 18 M documentos ≈ ~3 GB).
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

    /**
     * Timestamp de la muestra. El índice TTL sobre este campo lo crea
     * {@code MongoTtlConfig} al arrancar la app, leyendo
     * {@code rtls.retention.positions-history-days} (default 7).
     *
     * <p>No usamos {@code @Indexed(expireAfter="...")} con placeholder porque
     * Spring no lo expande dentro de annotations de Mongo — se intenta parsear
     * el literal {@code "${...}d"} como duración y peta el contexto.
     */
    private Instant ts;

    private double x;
    private double y;
    private double z;

    private Double accuracyM;
    private PositionEvent.Quality quality;
}
