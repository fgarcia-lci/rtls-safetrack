package com.lci.rtls.positioning.worker.dto;

import com.lci.rtls.positioning.worker.CompanyType;
import com.lci.rtls.positioning.worker.Worker;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Representación de un Worker para respuestas REST. Plano (sin entidades anidadas).
 */
public record WorkerDto(
        Long id,
        String employeeCode,
        String fullName,
        String phone,
        String email,
        String companyName,
        CompanyType companyType,
        String roleInPlant,
        String linkedUserId,
        String supervisorUserId,
        LocalDate hireDate,
        String photoUrl,
        boolean isActive,
        String notes,
        Instant createdAt,
        Instant updatedAt,
        String createdBy,
        String updatedBy
) {
    public static WorkerDto from(Worker w) {
        return new WorkerDto(
                w.getId(),
                w.getEmployeeCode(),
                w.getFullName(),
                w.getPhone(),
                w.getEmail(),
                w.getCompanyName(),
                w.getCompanyType(),
                w.getRoleInPlant(),
                w.getLinkedUserId(),
                w.getSupervisorUserId(),
                w.getHireDate(),
                w.getPhotoUrl(),
                w.isActive(),
                w.getNotes(),
                w.getCreatedAt(),
                w.getUpdatedAt(),
                w.getCreatedBy(),
                w.getUpdatedBy()
        );
    }
}
