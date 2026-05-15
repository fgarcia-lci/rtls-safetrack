package com.lci.rtls.positioning.sos.dto;

import com.lci.rtls.positioning.sos.SosEvent;

import java.time.Instant;

/**
 * Vista REST de un {@link SosEvent} para listados y respuestas de acción.
 */
public record SosEventDto(
        Long id,
        Long workerId,
        Long tagId,
        String plantId,
        Instant triggeredAt,
        SosEvent.Status status,
        Instant ackedAt,
        String ackedBy,
        Instant helpSentAt,
        String helpSentBy,
        String helpNotes,
        Instant resolvedAt,
        String resolvedBy,
        String resolutionNotes,
        Instant cancelledAt,
        String cancelledBy,
        String cancelReason
) {
    public static SosEventDto from(SosEvent e) {
        return new SosEventDto(
                e.getId(),
                e.getWorkerId(),
                e.getTagId(),
                e.getPlantId(),
                e.getTriggeredAt(),
                e.getStatus(),
                e.getAckedAt(),
                e.getAckedBy(),
                e.getHelpSentAt(),
                e.getHelpSentBy(),
                e.getHelpNotes(),
                e.getResolvedAt(),
                e.getResolvedBy(),
                e.getResolutionNotes(),
                e.getCancelledAt(),
                e.getCancelledBy(),
                e.getCancelReason()
        );
    }
}
