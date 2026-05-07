package com.lci.rtls.positioning.zone;

import com.lci.rtls.positioning.zone.dto.SafetyZoneCreateDto;
import com.lci.rtls.positioning.zone.dto.SafetyZoneDto;
import com.lci.rtls.positioning.zone.dto.SafetyZoneUpdateDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;

/**
 * REST CRUD de zonas de seguridad ({@link SafetyZone}) + permisos + policy
 * de notificación.
 *
 * <p>Lectura: cualquier rol con acceso a Safetrack (ADMIN, OPERATOR, USER).
 * <br>Escritura: solo ADMIN.
 */
@RestController
@RequestMapping("/v1/zones")
@RequiredArgsConstructor
public class ZoneController {

    private final ZoneService service;

    /**
     * Lista zonas de una planta. Si {@code isActive=true}, devuelve solo las
     * activas; sin el filtro devuelve todas (incluidas las soft-deleted).
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public List<SafetyZoneDto> list(
            @RequestParam String plantId,
            @RequestParam(required = false) Boolean isActive
    ) {
        return service.listByPlant(plantId, isActive);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public SafetyZoneDto get(@PathVariable Long id) {
        return service.getById(id);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<SafetyZoneDto> create(@Valid @RequestBody SafetyZoneCreateDto dto) {
        SafetyZoneDto created = service.create(dto);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public SafetyZoneDto update(@PathVariable Long id, @Valid @RequestBody SafetyZoneUpdateDto dto) {
        return service.update(id, dto);
    }

    /** Borrado lógico — la zona desaparece de los listados (solo recuperable
     *  por un admin con UPDATE manual sobre {@code deleted_at}). */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    /** Activa la zona — vuelve a ser evaluada por el motor de proximidad. */
    @PostMapping("/{id}/activate")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
    public SafetyZoneDto activate(@PathVariable Long id) {
        return service.setActive(id, true);
    }

    /** Desactiva la zona — sigue en la lista pero el motor la ignora. */
    @PostMapping("/{id}/deactivate")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
    public SafetyZoneDto deactivate(@PathVariable Long id) {
        return service.setActive(id, false);
    }
}
