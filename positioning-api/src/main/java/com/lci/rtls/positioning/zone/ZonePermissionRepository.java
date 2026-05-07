package com.lci.rtls.positioning.zone;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ZonePermissionRepository extends JpaRepository<ZonePermission, ZonePermissionId> {

    List<ZonePermission> findByIdZoneId(Long zoneId);

    void deleteByIdZoneId(Long zoneId);
}
