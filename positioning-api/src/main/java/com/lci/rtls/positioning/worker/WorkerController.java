package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.tag.dto.TagDto;
import com.lci.rtls.positioning.worker.dto.RiskScoreDto;
import com.lci.rtls.positioning.worker.dto.WorkerCreateDto;
import com.lci.rtls.positioning.worker.dto.WorkerDto;
import com.lci.rtls.positioning.worker.dto.WorkerHistoryDto;
import com.lci.rtls.positioning.worker.dto.WorkerUpdateDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
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

/**
 * REST CRUD de workers.
 *
 * <p>Lectura: cualquier rol con acceso a Safetrack (ADMIN, OPERATOR, USER).
 * <br>Escritura: solo ADMIN.
 */
@RestController
@RequestMapping("/v1/workers")
@RequiredArgsConstructor
public class WorkerController {

    private final WorkerService service;
    private final WorkerHistoryService historyService;
    private final WorkerRiskScoreService riskScoreService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public Page<WorkerDto> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) CompanyType companyType,
            @RequestParam(required = false) Boolean isActive,
            @RequestParam(required = false) WorkerSpecifications.RoleFilter roleFilter,
            @PageableDefault(size = 20, sort = "fullName") Pageable pageable
    ) {
        return service.list(search, companyType, isActive, roleFilter, pageable);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public WorkerDto get(@PathVariable Long id) {
        return service.getById(id);
    }

    /**
     * Sugiere el próximo employeeCode disponible siguiendo el patrón
     * {@code EMP-#####}. Se llama desde el dialog de creación para auto-rellenar
     * el campo. El código devuelto está libre en ese momento; si el admin lo
     * edita, el dialog vuelve a validar con {@link #checkEmployeeCode}.
     */
    @GetMapping("/next-code")
    @PreAuthorize("hasRole('ADMIN')")
    public java.util.Map<String, String> nextCode() {
        return java.util.Map.of("code", service.suggestNextEmployeeCode());
    }

    @GetMapping("/check-code")
    @PreAuthorize("hasRole('ADMIN')")
    public java.util.Map<String, Boolean> checkEmployeeCode(@RequestParam String code) {
        return java.util.Map.of("available", service.isEmployeeCodeAvailable(code));
    }

    /** Tag actualmente asignado al worker. Devuelve 204 si no tiene. */
    @GetMapping("/{id}/assigned-tag")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public ResponseEntity<TagDto> assignedTag(@PathVariable Long id) {
        TagDto tag = service.getAssignedTag(id);
        return tag == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(tag);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<WorkerDto> create(@Valid @RequestBody WorkerCreateDto dto) {
        WorkerDto created = service.create(dto);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public WorkerDto update(@PathVariable Long id, @Valid @RequestBody WorkerUpdateDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.softDelete(id);
    }

    /**
     * Histórico del trabajador entre {@code from} y {@code to} (ambos en ISO
     * instant, ej. {@code 2026-05-18T00:00:00Z}). Resolución del downsampling
     * de posiciones se elige automáticamente según el rango si no se pasa
     * {@code resolutionSeconds}.
     *
     * <p>Cap en el backend: {@code from} se sube al límite de retención si
     * va más atrás. Devuelve 400 si {@code to <= from}.
     */
    @GetMapping("/{id}/history")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public WorkerHistoryDto history(
            @PathVariable Long id,
            @RequestParam java.time.Instant from,
            @RequestParam java.time.Instant to,
            @RequestParam(required = false) Integer resolutionSeconds
    ) {
        return historyService.getHistory(id, from, to, resolutionSeconds);
    }

    /**
     * Score de riesgo del trabajador para el rango (default últimos 30 días).
     * Devuelve raw + normalizado 0–10 + breakdown + top zonas conflictivas.
     */
    @GetMapping("/{id}/risk-score")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public RiskScoreDto riskScore(
            @PathVariable Long id,
            @RequestParam(required = false) java.time.Instant from,
            @RequestParam(required = false) java.time.Instant to
    ) {
        java.time.Instant rangeTo = to != null ? to : java.time.Instant.now();
        java.time.Instant rangeFrom = from != null ? from : rangeTo.minus(java.time.Duration.ofDays(30));
        return riskScoreService.compute(id, rangeFrom, rangeTo);
    }
}
