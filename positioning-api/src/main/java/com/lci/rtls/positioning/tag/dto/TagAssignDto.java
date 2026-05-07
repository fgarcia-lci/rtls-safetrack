package com.lci.rtls.positioning.tag.dto;

import jakarta.validation.constraints.NotNull;

public record TagAssignDto(
        @NotNull Long workerId
) {
}
