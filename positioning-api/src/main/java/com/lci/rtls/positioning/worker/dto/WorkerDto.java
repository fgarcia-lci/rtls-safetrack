package com.lci.rtls.positioning.worker.dto;

import com.lci.rtls.positioning.company.Company;
import com.lci.rtls.positioning.worker.CompanyType;
import com.lci.rtls.positioning.worker.Worker;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Representación de un Worker para respuestas REST. Plano (sin entidades anidadas).
 *
 * <p>Lleva achatados los datos de contacto del supervisor / supervisor de respaldo
 * y de la empresa (centralita + manager) para que la ficha del trabajador pueda
 * pintarse sin tener que hacer más peticiones — es el origen de la columna
 * "Supervisión + Empresa" del WorkerDetail.
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
        String updatedBy,
        // --- Roles unificados V13 ---
        boolean isWorkerInPlant,
        boolean isSupervisor,
        boolean isCompanyManager,
        // --- Supervisor / empresa (con contacto achatado) ---
        Long supervisorId,
        String supervisorName,
        String supervisorPhone,
        String supervisorEmail,
        Long backupSupervisorId,
        String backupSupervisorName,
        String backupSupervisorPhone,
        String backupSupervisorEmail,
        Long companyId,
        String companyCatalogName,
        String companyPhone,
        String companyEmail,
        Long companyManagerId,
        String companyManagerName,
        String companyManagerPhone,
        String companyManagerEmail,
        // --- PRL ---
        LocalDate lastPrlTrainingDate,
        int prlValidMonths,
        String supervisorNotes
) {
    public static WorkerDto from(Worker w) {
        Worker sup = w.getSupervisorPerson();
        Worker bkp = w.getBackupSupervisorPerson();
        Company company = w.getCompany();
        Worker mgr = company != null ? company.getManagerPerson() : null;
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
                w.getUpdatedBy(),
                w.isWorkerInPlant(),
                w.isSupervisor(),
                w.isCompanyManager(),
                sup != null ? sup.getId() : null,
                sup != null ? sup.getFullName() : null,
                sup != null ? sup.getPhone() : null,
                sup != null ? sup.getEmail() : null,
                bkp != null ? bkp.getId() : null,
                bkp != null ? bkp.getFullName() : null,
                bkp != null ? bkp.getPhone() : null,
                bkp != null ? bkp.getEmail() : null,
                company != null ? company.getId() : null,
                company != null ? company.getName() : null,
                company != null ? company.getPhone() : null,
                company != null ? company.getEmail() : null,
                mgr != null ? mgr.getId() : null,
                mgr != null ? mgr.getFullName() : null,
                mgr != null ? mgr.getPhone() : null,
                mgr != null ? mgr.getEmail() : null,
                w.getLastPrlTrainingDate(),
                w.getPrlValidMonths(),
                w.getSupervisorNotes()
        );
    }
}
