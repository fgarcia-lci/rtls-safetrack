package com.lci.rtls.positioning.realtime.dto;

import java.time.Instant;
import java.util.List;

/**
 * Mensaje publicado al WebSocket {@code /topic/positions/{plantId}} cada 250 ms.
 * Contiene la última posición conocida de cada tag con datos nuevos en ese intervalo.
 */
public record PositionsBatchDto(
        Instant ts,
        List<RealtimePositionDto> positions
) {
}
