package com.lci.rtls.positioning.plantview;

import com.lci.rtls.positioning.plantview.dto.PlantViewDto;
import com.lci.rtls.positioning.plantview.dto.PlantViewLayerDto;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
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
                .map(view -> {
                    List<PlantViewLayerDto> layers = layerRepo
                            .findByPlantViewIdAndIsActiveTrueOrderByDisplayOrderAscNameAsc(view.getId())
                            .stream()
                            .map(PlantViewLayerDto::from)
                            .toList();
                    return PlantViewDto.from(view, layers);
                })
                .toList();
    }
}
