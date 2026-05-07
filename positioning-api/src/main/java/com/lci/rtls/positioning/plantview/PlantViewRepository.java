package com.lci.rtls.positioning.plantview;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlantViewRepository extends JpaRepository<PlantView, Long> {

    List<PlantView> findByPlantIdAndIsActiveTrueOrderByDisplayOrderAscNameAsc(String plantId);
}
