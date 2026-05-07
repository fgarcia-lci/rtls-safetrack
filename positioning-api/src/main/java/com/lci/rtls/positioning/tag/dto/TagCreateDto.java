package com.lci.rtls.positioning.tag.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TagCreateDto(
        @NotBlank @Size(max = 100) String serial,
        @Size(max = 100) String model,
        @Size(max = 100) String vendor,
        @Size(max = 50) String firmwareVersion,
        @NotBlank @Size(max = 50) String plantId,
        String notes
) {
}
