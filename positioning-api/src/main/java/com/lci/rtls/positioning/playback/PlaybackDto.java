package com.lci.rtls.positioning.playback;

import com.lci.rtls.positioning.worker.CompanyType;
import com.lci.rtls.positioning.zone.ZoneType;

import java.time.Instant;
import java.util.List;

/**
 * Snapshot batch para el reproductor temporal de la planta. El backend devuelve
 * un único payload con todas las trayectorias, eventos y SOS del rango pedido.
 * El frontend lo guarda en memoria y avanza por él con un timer local — no
 * necesita más peticiones al backend para mover el slider.
 *
 * <p>Hay un cap de 24h en el endpoint para evitar que un usuario pida una
 * semana completa por descuido (payload enorme).
 */
public record PlaybackDto(
        String plantId,
        Instant from,
        Instant to,
        int resolutionSeconds,
        List<PlaybackWorker> workers,
        List<PlaybackProximityEvent> proximityEvents,
        List<PlaybackSosEvent> sosEvents
) {

    public record PlaybackWorker(
            Long workerId,
            String employeeCode,
            String fullName,
            String companyName,
            CompanyType companyType,
            String photoUrl,
            String tagSerial,
            List<PositionPoint> positions
    ) {}

    public record PositionPoint(Instant ts, double x, double y, double z) {}

    public record PlaybackProximityEvent(
            Long id,
            Long workerId,
            Long zoneId,
            String zoneCode,
            String zoneName,
            ZoneType zoneType,
            Integer severity,
            Instant enteredAt,
            Instant exitedAt,
            Integer durationSec
    ) {}

    public record PlaybackSosEvent(
            Long id,
            Long workerId,
            Instant triggeredAt,
            Instant resolvedAt,
            String status
    ) {}
}
