package com.lci.rtls.positioning.tag.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Para actualización (PUT) NO se permite cambiar {@code serial} — es la clave
 * funcional del dispositivo. El estado se controla con assign/unassign o con
 * el flujo MQTT (el subscriber actualiza state automáticamente).
 */
public record TagUpdateDto(
        @Size(max = 100) String model,
        @Size(max = 100) String vendor,
        @Size(max = 50) String firmwareVersion,
        @NotBlank @Size(max = 50) String plantId,
        String notes
) {
}
