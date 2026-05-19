package com.lci.rtls.positioning.worker.dto;

import com.lci.rtls.positioning.worker.CompanyType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Petición de actualización (PUT). El {@code employeeCode} no es editable después
 * de la creación (es la clave funcional usada por el cliente).
 */
public record WorkerUpdateDto(
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
        @NotNull Boolean isActive,
        String notes,
        // --- Campos V13 (opcionales en update) ---
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
