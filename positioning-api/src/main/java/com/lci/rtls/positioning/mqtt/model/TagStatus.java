package com.lci.rtls.positioning.mqtt.model;

import java.time.Instant;

/**
 * Modelo interno de un mensaje de status del tag (batería, RSSI, estado).
 */
public record TagStatus(
        String tagId,
        String plantId,
        Instant ts,
        Integer batteryPct,
        Integer rssiDbm,
        String firmware,
        State state
) {

    public enum State {
        ACTIVE,
        IDLE,
        LOW_BATTERY,
        LOST,
        UNKNOWN
    }
}
