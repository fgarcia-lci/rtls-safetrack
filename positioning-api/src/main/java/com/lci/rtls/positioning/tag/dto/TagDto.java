package com.lci.rtls.positioning.tag.dto;

import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagState;
import com.lci.rtls.positioning.worker.CompanyType;

import java.time.Instant;

/**
 * Tag plano para REST. Incluye datos del worker asignado embebidos para que el
 * frontend pueda renderizar la fila sin pedir el worker por separado.
 */
public record TagDto(
        Long id,
        String serial,
        String model,
        String vendor,
        String firmwareVersion,
        Integer batteryLastPct,
        Instant lastSeenAt,
        TagState state,
        Long assignedWorkerId,
        String assignedWorkerName,
        String assignedWorkerCode,
        String assignedWorkerCompanyName,
        CompanyType assignedWorkerCompanyType,
        Instant assignedAt,
        String plantId,
        String notes,
        Instant createdAt,
        Instant updatedAt
) {
    public static TagDto from(Tag t) {
        var worker = t.getAssignedWorker();
        return new TagDto(
                t.getId(),
                t.getSerial(),
                t.getModel(),
                t.getVendor(),
                t.getFirmwareVersion(),
                t.getBatteryLastPct(),
                t.getLastSeenAt(),
                t.getState(),
                worker != null ? worker.getId() : null,
                worker != null ? worker.getFullName() : null,
                worker != null ? worker.getEmployeeCode() : null,
                worker != null ? worker.getCompanyName() : null,
                worker != null ? worker.getCompanyType() : null,
                t.getAssignedAt(),
                t.getPlantId(),
                t.getNotes(),
                t.getCreatedAt(),
                t.getUpdatedAt()
        );
    }
}
