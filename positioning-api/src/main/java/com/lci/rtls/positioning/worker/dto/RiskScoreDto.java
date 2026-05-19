package com.lci.rtls.positioning.worker.dto;

import java.time.Instant;
import java.util.List;

/**
 * Score de riesgo compuesto del trabajador para el rango consultado.
 *
 * <p>El {@code raw} es el score crudo (sin techo). El {@code normalized} es
 * 0–10 contra el percentil 90 de la planta en el mismo periodo. Esto permite
 * comparar operarios entre sí ("Juan está en el top 10% de incidentes").
 *
 * <p>{@code breakdown} desglosa los puntos para que la UI explique al
 * supervisor de dónde sale la cifra.
 */
public record RiskScoreDto(
        Long workerId,
        Instant from,
        Instant to,
        double raw,
        double normalized,
        Level level,
        Breakdown breakdown,
        List<TopZone> topZones
) {
    public enum Level { LOW, MEDIUM, HIGH, CRITICAL }

    public record Breakdown(
            long dangerEntries,
            long restrictedEntries,
            long warningEntries,
            long sosCount,
            long minutesInsideDanger,
            double recidivismFactor,
            double dangerPoints,
            double restrictedPoints,
            double warningPoints,
            double sosPoints,
            double dangerTimePoints
    ) {}

    public record TopZone(Long zoneId, String zoneCode, String zoneName, long entries) {}
}
