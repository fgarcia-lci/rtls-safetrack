package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.worker.dto.WorkerCreateDto;
import com.lci.rtls.positioning.worker.dto.WorkerDto;
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

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public Page<WorkerDto> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) CompanyType companyType,
            @RequestParam(required = false) Boolean isActive,
            @PageableDefault(size = 20, sort = "fullName") Pageable pageable
    ) {
        return service.list(search, companyType, isActive, pageable);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public WorkerDto get(@PathVariable Long id) {
        return service.getById(id);
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
}
