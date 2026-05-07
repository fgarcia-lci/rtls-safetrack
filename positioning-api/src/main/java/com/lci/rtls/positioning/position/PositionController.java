package com.lci.rtls.positioning.position;

import com.lci.rtls.positioning.ingestion.repository.TagPositionCurrentRepository;
import com.lci.rtls.positioning.position.dto.PositionDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST de consulta de posiciones.
 *
 * <p>Endpoint principal para que el frontend recupere el snapshot inicial al cargar
 * la vista de la planta. El push en tiempo real se hace por WebSocket (Fase 3).
 */
@RestController
@RequestMapping("/v1/positions")
@RequiredArgsConstructor
public class PositionController {

    private final TagPositionCurrentRepository currentRepo;

    /**
     * Devuelve la posición actual de todos los tags activos de la planta.
     * Ejemplo: {@code GET /api/v1/positions/current?plantId=TSP3}
     */
    @GetMapping("/current")
    public List<PositionDto> getCurrent(@RequestParam("plantId") String plantId) {
        return currentRepo.findByPlantId(plantId).stream()
                .map(PositionDto::from)
                .toList();
    }
}
