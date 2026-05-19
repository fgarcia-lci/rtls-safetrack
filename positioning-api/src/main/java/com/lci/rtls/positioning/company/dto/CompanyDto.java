package com.lci.rtls.positioning.company.dto;

import com.lci.rtls.positioning.worker.CompanyType;

/**
 * DTO con todos los datos relevantes de una empresa para el frontend, incluido
 * el manager (achatado en campos {@code manager*}) para evitar un fetch extra.
 */
public record CompanyDto(
        Long id,
        String name,
        CompanyType type,
        Long managerPersonId,
        String managerName,
        String managerPhone,
        String managerEmail,
        String managerNotes,
        boolean isActive
) {}
