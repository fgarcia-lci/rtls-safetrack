package com.lci.rtls.positioning.events.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EventCommentCreateDto(
        @NotBlank @Size(max = 4000) String commentText
) {}
