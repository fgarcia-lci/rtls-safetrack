package com.lci.rtls.positioning.zone.dto;

import com.lci.rtls.positioning.worker.CompanyType;
import com.lci.rtls.positioning.zone.ZoneType;

import java.time.Instant;

/**
 * Notificación push enviada por WebSocket a {@code /topic/alerts/{plantId}}
 * cuando un operario entra o sale de una zona vigilada.
 *
 * <p>Frontend renderiza estos en el panel de alertas (drawer lateral) y
 * dispara toasts visuales. El campo {@code state}=OPEN/CLOSED indica si la
 * alerta sigue activa o si ya cerró (operario salió).
 */
public record AlertNotificationDto(
        Long eventId,
        EventKind kind,
        AlertState state,
        Instant ts,

        // Datos del tag/operario (enriquecidos para drawer/banner/app móvil
        // sin necesidad de un fetch extra al recibir el push)
        String tagSerial,
        Long workerId,
        String workerName,
        String workerCode,
        String workerPhotoUrl,
        String workerCompanyName,
        CompanyType workerCompanyType,
        String workerRoleInPlant,

        // Datos de la zona
        Long zoneId,
        String zoneCode,
        String zoneName,
        ZoneType zoneType,
        Integer severity,
        String displayColor,

        // Solo para EXIT
        Long durationSec
) {
    public enum EventKind { ENTER, EXIT }
    public enum AlertState { OPEN, CLOSED }
}
