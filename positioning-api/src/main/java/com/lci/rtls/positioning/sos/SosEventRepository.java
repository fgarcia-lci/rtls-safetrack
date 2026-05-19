package com.lci.rtls.positioning.sos;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SosEventRepository extends JpaRepository<SosEvent, Long> {

    /** SOS activos (no resueltos / cancelados) de una planta — feed al panel guardia. */
    @Query("SELECT s FROM SosEvent s WHERE s.plantId = :plantId " +
           "AND s.status NOT IN (com.lci.rtls.positioning.sos.SosEvent.Status.RESOLVED, " +
           "com.lci.rtls.positioning.sos.SosEvent.Status.CANCELLED) " +
           "ORDER BY s.triggeredAt DESC")
    List<SosEvent> findActiveByPlant(@Param("plantId") String plantId);

    /** Histórico paginado para auditoría. */
    @Query("SELECT s FROM SosEvent s WHERE s.plantId = :plantId ORDER BY s.triggeredAt DESC")
    List<SosEvent> findAllByPlant(@Param("plantId") String plantId);

    /** SOS de un trabajador en un rango (ficha de operario). */
    @Query("SELECT s FROM SosEvent s WHERE s.workerId = :workerId " +
           "AND s.triggeredAt >= :from AND s.triggeredAt < :to ORDER BY s.triggeredAt ASC")
    List<SosEvent> findByWorkerAndDateRange(@Param("workerId") Long workerId,
                                            @Param("from") java.time.Instant from,
                                            @Param("to") java.time.Instant to);
}
