package com.lci.rtls.positioning.mqtt.model;

import java.time.Instant;
import java.util.Map;

/**
 * Modelo interno de un mensaje de posición. Lo produce un {@code PositionEventAdapter}
 * a partir del payload crudo del proveedor; lo consumen ingestion, zone engine, etc.
 */
public record PositionEvent(
        String tagId,
        String plantId,
        Instant ts,
        Position3D position,
        Double accuracyM,
        Quality quality,
        Source source,
        Long seq,
        Map<String, Object> vendorMeta
) {

    public enum Quality {
        GOOD,
        DEGRADED,
        BAD
    }

    public enum Source {
        UWB,
        BLE,
        WIFI,
        GPS,
        SIMULATED
    }
}
