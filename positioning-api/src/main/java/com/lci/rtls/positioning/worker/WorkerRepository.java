package com.lci.rtls.positioning.worker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface WorkerRepository extends JpaRepository<Worker, Long>, JpaSpecificationExecutor<Worker> {

    Optional<Worker> findByEmployeeCode(String employeeCode);

    boolean existsByEmployeeCode(String employeeCode);

    /** Personas marcadas como supervisor — para dropdowns "asignar supervisor". */
    List<Worker> findBySupervisorTrueAndIsActiveTrue();

    /** Personas marcadas como manager de empresa — para dropdowns en CompanyDialog. */
    List<Worker> findByCompanyManagerTrueAndIsActiveTrue();

    /** Empleados (cualquier rol) asignados a una empresa concreta del catálogo. */
    List<Worker> findByCompany_IdOrderByFullNameAsc(Long companyId);
}
