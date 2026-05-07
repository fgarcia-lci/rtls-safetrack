package com.lci.rtls.positioning.plantview;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlantViewLayerRepository extends JpaRepository<PlantViewLayer, Long> {

    List<PlantViewLayer> findByPlantViewIdAndIsActiveTrueOrderByDisplayOrderAscNameAsc(Long plantViewId);
}
