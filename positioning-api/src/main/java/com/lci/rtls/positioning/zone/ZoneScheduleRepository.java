package com.lci.rtls.positioning.zone;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ZoneScheduleRepository extends JpaRepository<ZoneSchedule, Long> {

    List<ZoneSchedule> findByZoneId(Long zoneId);

    void deleteByZoneId(Long zoneId);
}
