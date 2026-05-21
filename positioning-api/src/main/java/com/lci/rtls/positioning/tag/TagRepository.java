package com.lci.rtls.positioning.tag;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface TagRepository extends JpaRepository<Tag, Long>, JpaSpecificationExecutor<Tag> {

    Optional<Tag> findBySerial(String serial);

    boolean existsBySerial(String serial);

    /** Tag asignado actualmente a un worker (puede ser empty si no tiene). */
    Optional<Tag> findByAssignedWorker_Id(Long workerId);
}
