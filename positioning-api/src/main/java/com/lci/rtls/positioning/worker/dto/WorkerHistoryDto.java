package com.lci.rtls.positioning.worker.dto;

import com.lci.rtls.positioning.zone.ZoneType;

import java.time.Instant;
import java.util.List;

/**
 * Histórico de un trabajador en un rango temporal — todo lo que la ficha
 * necesita en un solo fetch para construir mapa de ruta + heatmap + lista
 * de incidentes + KPIs del periodo.
 */
public record WorkerHistoryDto(
        Long workerId,
        Instant from,
        Instant to,
        /** Lecturas de posición downsampled (1 cada N segundos según rango). */
        List<PositionPoint> positions,
        /** Eventos de proximidad disparados en el rango (ordenados por enteredAt asc). */
        List<HistoryProximityEvent> proximityEvents,
        /** SOS disparados en el rango. */
        List<HistorySosEvent> sosEvents,
        /** Tiempo (segundos) en cada zona del rango — para el heatmap por zona. */
        List<TimeInZone> timeInZones,
        /** Conteo de eventos por tipo de zona — para KPIs del periodo. */
        EventCounts counts
) {
    public record PositionPoint(Instant ts, double x, double y, double z) {}

    public record HistoryProximityEvent(
            Long id,
            Long zoneId,
            String zoneCode,
            String zoneName,
            ZoneType zoneType,
            Integer severity,
            Instant enteredAt,
            Instant exitedAt,
            Integer durationSec,
            boolean acknowledged
    ) {}

    public record HistorySosEvent(
            Long id,
            Instant triggeredAt,
            Instant resolvedAt,
            String status
    ) {}

    public record TimeInZone(
            Long zoneId,
            String zoneCode,
            String zoneName,
            ZoneType zoneType,
            long secondsInside,
            int entries
    ) {}

    public record EventCounts(
            long dangerEntries,
            long restrictedEntries,
            long warningEntries,
            long otherEntries,
            long sosCount,
            long totalDurationDangerSec
    ) {}
}
