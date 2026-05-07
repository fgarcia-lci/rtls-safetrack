package com.lci.rtls.positioning.realtime.dto;

import com.lci.rtls.positioning.mqtt.model.PositionEvent;

import java.time.Instant;

/**
 * Posición individual dentro del batch que se publica al WebSocket.
 * Forma plana y mínima — el frontend solo necesita esto para interpolar y pintar.
 */
public record RealtimePositionDto(
        String tagId,
        double x,
        double y,
        double z,
        PositionEvent.Quality quality,
        Instant ts
) {
    public static RealtimePositionDto from(PositionEvent event) {
        return new RealtimePositionDto(
                event.tagId(),
                event.position().x(),
                event.position().y(),
                event.position().z(),
                event.quality(),
                event.ts()
        );
    }
}
