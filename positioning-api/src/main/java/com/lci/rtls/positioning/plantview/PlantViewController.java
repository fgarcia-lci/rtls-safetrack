package com.lci.rtls.positioning.plantview;

import com.lci.rtls.positioning.plantview.dto.FloorplanUpsertDto;
import com.lci.rtls.positioning.plantview.dto.PlantViewCalibrationRequest;
import com.lci.rtls.positioning.plantview.dto.PlantViewDto;
import com.lci.rtls.positioning.plantview.dto.PlantViewLayerDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/v1/plant-views")
@RequiredArgsConstructor
public class PlantViewController {

    private final PlantViewRepository viewRepo;
    private final PlantViewLayerRepository layerRepo;

    /**
     * Lists active plant-views for a plant. Reading endpoint used by the
     * 3D/2D viewers — never returns the heavy svg_content (lazy field).
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public List<PlantViewDto> listForPlant(@RequestParam("plantId") String plantId) {
        return viewRepo.findByPlantIdAndIsActiveTrueOrderByDisplayOrderAscNameAsc(plantId).stream()
                .map(view -> PlantViewDto.from(view, layersOf(view)))
                .toList();
    }

    /** Lists ALL plant-views (active + inactive) for the admin UI. */
    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public List<PlantViewDto> listAllForPlant(@RequestParam("plantId") String plantId) {
        return viewRepo.findByPlantIdOrderByDisplayOrderAscNameAsc(plantId).stream()
                .map(view -> PlantViewDto.from(view, layersOf(view)))
                .toList();
    }

    /**
     * Serves the SVG content of a FLOORPLAN_2D plant-view. Cached by the
     * browser/CDN — the content is immutable while the row exists; if an
     * admin re-uploads, the URL stays the same so consider sending an ETag
     * later if heavy edits start happening.
     */
    @GetMapping(value = "/{id}/asset", produces = "image/svg+xml")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    @Transactional(readOnly = true)
    public ResponseEntity<String> asset(@PathVariable Long id) {
        PlantView pv = viewRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "PlantView " + id + " no encontrado"));
        if (pv.getType() != PlantView.Type.FLOORPLAN_2D || pv.getSvgContent() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Esta vista no tiene SVG asociado");
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "image/svg+xml; charset=utf-8")
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .body(pv.getSvgContent());
    }

    /**
     * Creates a new FLOORPLAN_2D plant-view. The SVG content + bbox come from
     * the admin after exporting from Revit and converting via LibreCAD.
     */
    @PostMapping("/floorplan")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PlantViewDto> createFloorplan(@Valid @RequestBody FloorplanUpsertDto dto) {
        if (viewRepo.existsByPlantIdAndCode(dto.plantId(), dto.code())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ya existe una vista con code '" + dto.code() + "' en la planta " + dto.plantId());
        }
        PlantView pv = PlantView.builder()
                .plantId(dto.plantId())
                .code(dto.code())
                .name(dto.name())
                .type(PlantView.Type.FLOORPLAN_2D)
                // Mantenemos un assetUrl marcador para no romper NOT NULL legacy —
                // el contenido real viaja por /v1/plant-views/{id}/asset.
                .assetUrl("/v1/plant-views/" + dto.code() + "/asset")
                .svgContent(dto.svgContent())
                .worldBboxMinX(dto.worldBboxMinX())
                .worldBboxMinY(dto.worldBboxMinY())
                .worldBboxMaxX(dto.worldBboxMaxX())
                .worldBboxMaxY(dto.worldBboxMaxY())
                .svgFlipY(dto.svgFlipY() == null || dto.svgFlipY())
                .displayOrder(dto.displayOrder())
                .isActive(dto.isActive() == null || dto.isActive())
                .build();
        PlantView saved = viewRepo.save(pv);
        // Ajusta el assetUrl con el id real (queda estable, sirve para CDN cache).
        saved.setAssetUrl("/v1/plant-views/" + saved.getId() + "/asset");
        viewRepo.save(saved);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(PlantViewDto.from(saved, layersOf(saved)));
    }

    /** Updates an existing FLOORPLAN_2D — metadata + optionally SVG content. */
    @PutMapping("/{id}/floorplan")
    @PreAuthorize("hasRole('ADMIN')")
    public PlantViewDto updateFloorplan(@PathVariable Long id, @Valid @RequestBody FloorplanUpsertDto dto) {
        PlantView pv = viewRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "PlantView " + id + " no encontrado"));
        if (pv.getType() != PlantView.Type.FLOORPLAN_2D) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Esta vista no es FLOORPLAN_2D");
        }
        if (!pv.getCode().equals(dto.code())
                && viewRepo.existsByPlantIdAndCode(dto.plantId(), dto.code())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ya existe otra vista con code '" + dto.code() + "'");
        }
        pv.setCode(dto.code());
        pv.setName(dto.name());
        pv.setSvgContent(dto.svgContent());
        pv.setWorldBboxMinX(dto.worldBboxMinX());
        pv.setWorldBboxMinY(dto.worldBboxMinY());
        pv.setWorldBboxMaxX(dto.worldBboxMaxX());
        pv.setWorldBboxMaxY(dto.worldBboxMaxY());
        if (dto.svgFlipY() != null) pv.setSvgFlipY(dto.svgFlipY());
        if (dto.displayOrder() != null) pv.setDisplayOrder(dto.displayOrder());
        if (dto.isActive() != null) pv.setActive(dto.isActive());
        return PlantViewDto.from(viewRepo.save(pv), layersOf(pv));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        PlantView pv = viewRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "PlantView " + id + " no encontrado"));
        // For 2D floorplans we hard-delete (no historical references). For
        // MODEL_3D we mark inactive to preserve user prefs that point to it.
        if (pv.getType() == PlantView.Type.FLOORPLAN_2D) {
            viewRepo.delete(pv);
        } else {
            pv.setActive(false);
            viewRepo.save(pv);
        }
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
        PlantView pv = viewRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "PlantView " + id + " no encontrado"));
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
