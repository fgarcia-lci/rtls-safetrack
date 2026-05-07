package com.lci.rtls.positioning.zone.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.ShapeType;
import com.lci.rtls.positioning.zone.ZoneNotificationPolicy;
import com.lci.rtls.positioning.zone.ZonePermission;
import com.lci.rtls.positioning.zone.ZoneType;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.List;

/**
 * Vista REST de una zona — incluye permisos resueltos y policy de
 * notificación. El polígono se devuelve como matriz de coords (no string)
 * para que el frontend lo consuma directamente.
 */
public record SafetyZoneDto(
        Long id,
        String plantId,
        String code,
        String name,
        String description,
        ZoneType type,
        ShapeType shapeType,
        Integer severity,
        List<List<Double>> polygon2d,
        BigDecimal zMin,
        BigDecimal zMax,
        BigDecimal bufferApproachM,
        String relatedDeviceId,
        boolean isActive,
        String displayColor,
        List<String> allowedRoles,
        NotificationPolicyDto notificationPolicy,
        Instant createdAt,
        Instant updatedAt
) {

    public static SafetyZoneDto from(
            SafetyZone z,
            List<ZonePermission> permissions,
            ZoneNotificationPolicy policy,
            ObjectMapper om
    ) {
        List<List<Double>> polygon = parsePolygon(z.getPolygon2d(), om);
        List<String> roles = permissions == null ? Collections.emptyList()
                : permissions.stream().map(p -> p.getId().getRoleCode()).toList();
        return new SafetyZoneDto(
                z.getId(),
                z.getPlantId(),
                z.getCode(),
                z.getName(),
                z.getDescription(),
                z.getType(),
                z.getShapeType(),
                z.getSeverity(),
                polygon,
                z.getZMin(),
                z.getZMax(),
                z.getBufferApproachM(),
                z.getRelatedDeviceId(),
                z.isActive(),
                z.getDisplayColor(),
                roles,
                NotificationPolicyDto.from(policy),
                z.getCreatedAt(),
                z.getUpdatedAt()
        );
    }

    private static List<List<Double>> parsePolygon(String json, ObjectMapper om) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return om.readValue(json, new TypeReference<List<List<Double>>>() {});
        } catch (IOException e) {
            // El campo es JSON validado en BD; un fallo aquí es bug nuestro.
            throw new IllegalStateException("polygon_2d malformado", e);
        }
    }
}
