package com.lci.rtls.positioning.zone;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface ProximityEventRepository
        extends JpaRepository<ProximityEvent, Long>, JpaSpecificationExecutor<ProximityEvent> {

    /** Eventos abiertos (operario aún dentro) de una planta — para reconstruir estado. */
    List<ProximityEvent> findByPlantIdAndExitedAtIsNull(String plantId);

    /** Evento abierto de un par tag-zona, si existe. */
    Optional<ProximityEvent> findFirstByTagIdAndZoneIdAndExitedAtIsNull(Long tagId, Long zoneId);

    List<ProximityEvent> findByPlantIdOrderByEnteredAtDesc(String plantId);
}
