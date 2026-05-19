package com.lci.rtls.positioning.zone;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ProximityEventRepository
        extends JpaRepository<ProximityEvent, Long>, JpaSpecificationExecutor<ProximityEvent> {

    /** Eventos abiertos (operario aún dentro) de una planta — para reconstruir estado. */
    List<ProximityEvent> findByPlantIdAndExitedAtIsNull(String plantId);

    /** Evento abierto de un par tag-zona, si existe. */
    Optional<ProximityEvent> findFirstByTagIdAndZoneIdAndExitedAtIsNull(Long tagId, Long zoneId);

    List<ProximityEvent> findByPlantIdOrderByEnteredAtDesc(String plantId);

    // ===== Queries para Dashboard =====

    /** Cuenta de eventos en un rango — KPI "alertas hoy". */
    @Query("SELECT COUNT(e) FROM ProximityEvent e WHERE e.plantId = :plantId " +
           "AND e.enteredAt >= :from AND e.enteredAt < :to")
    long countByPlantAndDateRange(@Param("plantId") String plantId,
                                  @Param("from") Instant from,
                                  @Param("to") Instant to);

    /** Top N zonas por número de eventos en un rango. Devuelve [zoneId, count]. */
    @Query("SELECT e.zoneId, COUNT(e) AS c FROM ProximityEvent e " +
           "WHERE e.plantId = :plantId AND e.enteredAt >= :from " +
           "GROUP BY e.zoneId ORDER BY c DESC")
    List<Object[]> topZonesByEvents(@Param("plantId") String plantId,
                                    @Param("from") Instant from);

    /** Top N workers por eventos (peligrosidad). Devuelve [workerId, count]. */
    @Query("SELECT e.workerId, COUNT(e) AS c FROM ProximityEvent e " +
           "WHERE e.plantId = :plantId AND e.workerId IS NOT NULL AND e.enteredAt >= :from " +
           "GROUP BY e.workerId ORDER BY c DESC")
    List<Object[]> topWorkersByEvents(@Param("plantId") String plantId,
                                      @Param("from") Instant from);

    /** Tiempo medio (segundos) hasta ACK en un rango — KPI MTTR. */
    @Query("SELECT AVG(TIMESTAMPDIFF(SECOND, e.enteredAt, e.acknowledgedAt)) FROM ProximityEvent e " +
           "WHERE e.plantId = :plantId AND e.acknowledgedAt IS NOT NULL AND e.enteredAt >= :from")
    Double avgMttrSecondsByPlant(@Param("plantId") String plantId,
                                 @Param("from") Instant from);

    // ===== Queries para ficha de trabajador =====

    /** Eventos de un trabajador en un rango — para tab Histórico/Incidentes. */
    List<ProximityEvent> findByWorkerIdAndEnteredAtBetweenOrderByEnteredAtAsc(
            Long workerId, Instant from, Instant to);

    /** Conteo de entradas por trabajador en rango, agrupado por zone_id.
     *  Útil para el risk score y "top zonas conflictivas del operario". */
    @Query("SELECT e.zoneId, COUNT(e) FROM ProximityEvent e " +
           "WHERE e.workerId = :workerId AND e.enteredAt >= :from AND e.enteredAt < :to " +
           "GROUP BY e.zoneId")
    List<Object[]> countByWorkerGroupedByZone(@Param("workerId") Long workerId,
                                              @Param("from") Instant from,
                                              @Param("to") Instant to);

    /** Suma de duración (segundos) por trabajador agrupado por zone_id. */
    @Query("SELECT e.zoneId, COALESCE(SUM(e.durationSec), 0) FROM ProximityEvent e " +
           "WHERE e.workerId = :workerId AND e.enteredAt >= :from AND e.enteredAt < :to " +
           "AND e.durationSec IS NOT NULL " +
           "GROUP BY e.zoneId")
    List<Object[]> totalDurationByWorkerGroupedByZone(@Param("workerId") Long workerId,
                                                      @Param("from") Instant from,
                                                      @Param("to") Instant to);
}
