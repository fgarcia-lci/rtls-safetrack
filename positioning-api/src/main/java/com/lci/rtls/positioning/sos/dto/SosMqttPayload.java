package com.lci.rtls.positioning.sos.dto;

import java.time.Instant;

/**
 * Payload que publica el firmware del tag al pulsar el botón SOS / pánico.
 * Topic: {@code sim/v1/plant/{plantId}/tag/{tagId}/sos}.
 *
 * <p>El tag_id y plant_id se extraen del topic, pero los duplicamos en el
 * payload por robustez (validación + audit log).
 *
 * <p>Campos opcionales: {@code pressed_at} (si el firmware tiene reloj
 * sincronizado), {@code battery_pct}, {@code rssi_dbm}. Si vienen NULL, el
 * backend usa {@code Instant.now()} y los demás como desconocidos.
 */
public record SosMqttPayload(
        String tag_id,
        String plant_id,
        Instant pressed_at,
        Integer battery_pct,
        Integer rssi_dbm,
        String firmware,
        String source
) {}
