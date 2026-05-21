package com.lci.rtls.positioning.plantview;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlantViewRepository extends JpaRepository<PlantView, Long> {

    List<PlantView> findByPlantIdAndIsActiveTrueOrderByDisplayOrderAscNameAsc(String plantId);

    /** All views for a plant (active + inactive) — used by the admin UI. */
    List<PlantView> findByPlantIdOrderByDisplayOrderAscNameAsc(String plantId);

    /** Currently active FLOORPLAN_2D for a plant — at most one is shown in the 2D viewer. */
    Optional<PlantView> findFirstByPlantIdAndTypeAndIsActiveTrueOrderByDisplayOrderAsc(
            String plantId, PlantView.Type type);

    boolean existsByPlantIdAndCode(String plantId, String code);
}
