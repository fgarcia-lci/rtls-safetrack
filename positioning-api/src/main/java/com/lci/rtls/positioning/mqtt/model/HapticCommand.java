package com.lci.rtls.positioning.mqtt.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Comando háptico enviado al tag (vibración + LED). El backend lo publica al
 * topic {@code sim/v1/plant/{plantId}/tag/{serial}/command} cuando un operario
 * entra en una zona que tiene {@code notifyWorker=true} y
 * {@code channelHapticMqtt=true}.
 *
 * @param cmdId       UUID único del comando, idempotencia.
 * @param type        siempre "haptic" en este record (extensible a otros tipos).
 * @param pattern     INFO / WARNING / DANGER → el firmware del tag mapea a
 *                    intensidad/duración de vibración.
 * @param durationMs  duración total de la vibración (sugerido por el server,
 *                    el firmware puede ignorarlo si el pattern lo define).
 * @param ts          timestamp de emisión.
 */
public record HapticCommand(
        String cmdId,
        String type,
        Pattern pattern,
        Integer durationMs,
        Instant ts
) {
    public enum Pattern {
        INFO,
        WARNING,
        DANGER
    }

    public static HapticCommand of(Pattern pattern, int durationMs) {
        return new HapticCommand(
                UUID.randomUUID().toString(),
                "haptic",
                pattern,
                durationMs,
                Instant.now()
        );
    }
}
