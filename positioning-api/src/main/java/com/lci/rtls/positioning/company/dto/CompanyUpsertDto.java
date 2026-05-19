package com.lci.rtls.positioning.company.dto;

import com.lci.rtls.positioning.worker.CompanyType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Payload de creación / edición de una empresa. */
public record CompanyUpsertDto(
        @NotBlank String name,
        @NotNull CompanyType type,
        /** Persona designada manager. Obligatorio en negocio — sin manager
         * la empresa no recibe escalado de incidentes. */
        @NotNull Long managerPersonId,
        String managerNotes,
        Boolean isActive
) {}
