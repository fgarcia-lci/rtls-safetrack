package com.lci.rtls.positioning.company.dto;

import com.lci.rtls.positioning.worker.CompanyType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload de creación / edición de una empresa.
 *
 * <p>Tras V14: phone + email son obligatorios (centralita de la empresa).
 * El manager personal es opcional — permite crear empresas antes de asignar
 * a una persona como manager.
 */
public record CompanyUpsertDto(
        @NotBlank @Size(max = 120) String name,
        @NotNull CompanyType type,
        @NotBlank @Size(max = 40) String phone,
        @NotBlank @Email @Size(max = 120) String email,
        /** Manager personal opcional. */
        Long managerPersonId,
        String managerNotes,
        Boolean isActive
) {}
