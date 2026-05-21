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
        /** Teléfono / email de contacto general de la empresa (centralita). */
        String phone,
        String email,
        /** Manager personal (opcional, puede ser null). */
        Long managerPersonId,
        String managerName,
        String managerPhone,
        String managerEmail,
        String managerNotes,
        boolean isActive
) {}
