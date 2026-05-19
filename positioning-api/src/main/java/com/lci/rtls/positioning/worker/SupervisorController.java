package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.worker.dto.WorkerDto;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Lectura de supervisores y managers de empresa para poblar dropdowns en el
 * frontend. NO hace creación / edición — eso va por el CRUD de Worker normal
 * (un supervisor sigue siendo una persona; solo cambia un flag).
 */
@RestController
@RequestMapping("/v1/supervisors")
@RequiredArgsConstructor
public class SupervisorController {

    private final WorkerRepository repo;

    /**
     * Lista personas activas marcadas como supervisor.
     * Si {@code includeManagers=true} también incluye personas marcadas
     * como manager de empresa (útil para dropdowns combinados "elegir
     * persona de contacto").
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public List<WorkerDto> list(@RequestParam(required = false, defaultValue = "false") boolean includeManagers) {
        var supervisors = repo.findBySupervisorTrueAndIsActiveTrue();
        if (!includeManagers) {
            return supervisors.stream().map(WorkerDto::from).toList();
        }
        var managers = repo.findByCompanyManagerTrueAndIsActiveTrue();
        // Set para deduplicar a personas que tengan ambos roles.
        var byId = new java.util.LinkedHashMap<Long, Worker>();
        supervisors.forEach(w -> byId.put(w.getId(), w));
        managers.forEach(w -> byId.put(w.getId(), w));
        return byId.values().stream().map(WorkerDto::from).toList();
    }
}
