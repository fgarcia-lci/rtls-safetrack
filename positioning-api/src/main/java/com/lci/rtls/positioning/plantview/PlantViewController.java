package com.lci.rtls.positioning.plantview;

import com.lci.rtls.positioning.plantview.dto.PlantViewCalibrationRequest;
import com.lci.rtls.positioning.plantview.dto.PlantViewDto;
import com.lci.rtls.positioning.plantview.dto.PlantViewLayerDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/v1/plant-views")
@RequiredArgsConstructor
public class PlantViewController {

    private final PlantViewRepository viewRepo;
    private final PlantViewLayerRepository layerRepo;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public List<PlantViewDto> listForPlant(@RequestParam("plantId") String plantId) {
        return viewRepo.findByPlantIdAndIsActiveTrueOrderByDisplayOrderAscNameAsc(plantId).stream()
                .map(view -> PlantViewDto.from(view, layersOf(view)))
                .toList();
    }

    /**
     * Admin-only calibration update for a plant-view. The values are read
     * by every user when they open the view, so this is the single source
     * of truth for model alignment (offset Y, default avatar height,
     * default camera). Anyone with permission can change them and the
     * change applies for everyone next time the view is opened.
     */
    @PutMapping("/{id}/calibration")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PlantViewDto> updateCalibration(
            @PathVariable Long id,
            @RequestBody PlantViewCalibrationRequest body) {
        PlantView pv = viewRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("PlantView not found: " + id));
        if (body.defaultYOffset() != null) pv.setDefaultYOffset(body.defaultYOffset());
        if (body.defaultAvatarHeightM() != null) pv.setDefaultAvatarHeightM(body.defaultAvatarHeightM());
        if (body.defaultCamera() != null) pv.setDefaultCamera(body.defaultCamera());
        viewRepo.save(pv);
        return ResponseEntity.ok(PlantViewDto.from(pv, layersOf(pv)));
    }

    private List<PlantViewLayerDto> layersOf(PlantView view) {
        return layerRepo
                .findByPlantViewIdAndIsActiveTrueOrderByDisplayOrderAscNameAsc(view.getId())
                .stream()
                .map(PlantViewLayerDto::from)
                .toList();
    }
}
