package com.lci.rtls.positioning.worker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface WorkerRepository extends JpaRepository<Worker, Long>, JpaSpecificationExecutor<Worker> {

    Optional<Worker> findByEmployeeCode(String employeeCode);

    boolean existsByEmployeeCode(String employeeCode);
}
