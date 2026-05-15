package com.lci.rtls.positioning.sos.dto;

import com.lci.rtls.positioning.worker.CompanyType;

import java.time.Instant;
import java.util.List;

/**
 * Notificación push enviada por WebSocket a {@code /topic/sos/{plantId}}
 * cuando se dispara un SOS. El frontend lo recibe y muestra la sirena
 * full-screen variante PANIC con foto del operario y datos de contexto.
 *
 * <p>Distinto de {@link com.lci.rtls.positioning.zone.dto.AlertNotificationDto}
 * porque es una alerta de naturaleza distinta (no zona, sino petición
 * explícita) y la UI la trata diferente.
 */
public record SosNotificationDto(
        Long eventId,
        Instant triggeredAt,
        Status status,

        // Tag/operario
        String tagSerial,
        Long workerId,
        String workerName,
        String workerCode,
        String workerPhotoUrl,
        String workerCompanyName,
        CompanyType workerCompanyType,
        String workerRoleInPlant,
        String workerPhone,

        // Contexto al pulsar
        Double posX,
        Double posY,
        Double posZ,
        List<Long> zonesAtTrigger,
        List<Long> nearbyWorkerIds,

        // Estado del tag
        Integer batteryPct,
        Integer rssiDbm
) {
    public enum Status { REQUESTED, ACKED, HELP_SENT, RESOLVED, CANCELLED }
}
