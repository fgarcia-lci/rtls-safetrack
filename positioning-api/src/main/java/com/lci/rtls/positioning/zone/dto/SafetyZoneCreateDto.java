package com.lci.rtls.positioning.zone.dto;

import com.lci.rtls.positioning.zone.ShapeType;
import com.lci.rtls.positioning.zone.ZoneType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/**
 * Payload para crear una zona. {@code plantId} y {@code code} no se podrán
 * cambiar luego (forman la unique key). El polígono debe tener al menos 3
 * vértices y cada vértice un par {@code [x, y]} en coords mundiales.
 */
public record SafetyZoneCreateDto(
        @NotBlank String plantId,
        @NotBlank @Size(max = 50) String code,
        @NotBlank @Size(max = 200) String name,
        String description,
        @NotNull ZoneType type,
        @NotNull ShapeType shapeType,
        @NotNull @Min(1) @Max(5) Integer severity,
        @NotNull @Size(min = 3, message = "polígono debe tener al menos 3 vértices")
        List<List<@NotNull Double>> polygon2d,
        @NotNull BigDecimal zMin,
        @NotNull BigDecimal zMax,
        BigDecimal bufferApproachM,
        @Size(max = 50) String relatedDeviceId,
        @Pattern(regexp = "^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$",
                message = "displayColor debe ser hex #RRGGBB o #RRGGBBAA")
        String displayColor,
        List<String> allowedRoles,
        NotificationPolicyDto notificationPolicy
) {}
