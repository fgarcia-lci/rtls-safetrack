package com.lci.rtls.positioning.worker.dto;

import com.lci.rtls.positioning.worker.CompanyType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Petición de creación de un Worker. Required: employeeCode, fullName, companyName, companyType.
 */
public record WorkerCreateDto(
        @NotBlank @Size(max = 50) String employeeCode,
        @NotBlank @Size(max = 200) String fullName,
        @Size(max = 50) String phone,
        @Email @Size(max = 200) String email,
        @NotBlank @Size(max = 200) String companyName,
        @NotNull CompanyType companyType,
        @Size(max = 100) String roleInPlant,
        @Size(max = 36) String linkedUserId,
        @Size(max = 36) String supervisorUserId,
        LocalDate hireDate,
        @Size(max = 500) String photoUrl,
        String notes,
        // --- Campos V13 (todos opcionales en creación) ---
        Boolean isWorkerInPlant,
        Boolean isSupervisor,
        Boolean isCompanyManager,
        Long supervisorId,
        Long backupSupervisorId,
        Long companyId,
        LocalDate lastPrlTrainingDate,
        Integer prlValidMonths,
        String supervisorNotes
) {
}
