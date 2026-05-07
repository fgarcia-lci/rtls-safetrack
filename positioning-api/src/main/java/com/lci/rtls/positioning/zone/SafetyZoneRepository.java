package com.lci.rtls.positioning.zone;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface SafetyZoneRepository
        extends JpaRepository<SafetyZone, Long>, JpaSpecificationExecutor<SafetyZone> {

    /** Activas y NO borradas. */
    List<SafetyZone> findByPlantIdAndIsActiveTrueAndDeletedAtIsNull(String plantId);

    /** Todas las NO borradas (incluye desactivadas). */
    List<SafetyZone> findByPlantIdAndDeletedAtIsNull(String plantId);

    /** Para el motor de proximidad — solo zonas vivas y activas. */
    List<SafetyZone> findByIsActiveTrueAndDeletedAtIsNull();

    Optional<SafetyZone> findByPlantIdAndCode(String plantId, String code);

    boolean existsByPlantIdAndCode(String plantId, String code);
}
