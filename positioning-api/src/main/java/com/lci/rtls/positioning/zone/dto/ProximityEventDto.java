package com.lci.rtls.positioning.zone.dto;

import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.worker.CompanyType;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.zone.ProximityEvent;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.ZoneType;

import java.time.Instant;

/**
 * DTO de un {@link ProximityEvent} expuesto vía REST. Incluye datos
 * resueltos del worker, tag y zona para que el frontend no tenga que
 * hacer joins extra.
 */
public record ProximityEventDto(
        Long id,
        Long workerId,
        String workerName,
        String workerCode,
        // Datos enriquecidos del worker para que el frontend (drawer de
        // alertas / banner / app móvil) renderice contexto completo sin
        // hacer una segunda query. Coste mínimo: el Worker ya está
        // cargado en {@code from(...)} para resolver el nombre.
        String workerPhotoUrl,
        String workerCompanyName,
        CompanyType workerCompanyType,
        String workerRoleInPlant,
        Long tagId,
        String tagSerial,
        Long zoneId,
        String zoneCode,
        String zoneName,
        ZoneType zoneType,
        Integer zoneSeverity,
        String zoneColor,
        String plantId,
        Instant enteredAt,
        Instant exitedAt,
        Integer durationSec,
        Integer maxSeverity,
        Boolean authorized,
        Instant acknowledgedAt,
        String acknowledgedBy
) {

    public static ProximityEventDto from(ProximityEvent e, Tag tag, Worker worker, SafetyZone zone) {
        return new ProximityEventDto(
                e.getId(),
                e.getWorkerId(),
                worker != null ? worker.getFullName() : null,
                worker != null ? worker.getEmployeeCode() : null,
                worker != null ? worker.getPhotoUrl() : null,
                worker != null ? worker.getCompanyName() : null,
                worker != null ? worker.getCompanyType() : null,
                worker != null ? worker.getRoleInPlant() : null,
                e.getTagId(),
                tag != null ? tag.getSerial() : null,
                e.getZoneId(),
                zone != null ? zone.getCode() : null,
                zone != null ? zone.getName() : null,
                zone != null ? zone.getType() : null,
                zone != null ? zone.getSeverity() : null,
                zone != null ? zone.getDisplayColor() : null,
                e.getPlantId(),
                e.getEnteredAt(),
                e.getExitedAt(),
                e.getDurationSec(),
                e.getMaxSeverity(),
                e.getAuthorized(),
                e.getAcknowledgedAt(),
                e.getAcknowledgedBy()
        );
    }
}
