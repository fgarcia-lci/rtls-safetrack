package com.lci.rtls.positioning.company;

import com.lci.rtls.positioning.company.dto.CompanyDto;
import com.lci.rtls.positioning.company.dto.CompanyUpsertDto;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.worker.WorkerRepository;
import com.lci.rtls.positioning.worker.dto.WorkerDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class CompanyService {

    private final CompanyRepository repo;
    private final WorkerRepository workerRepo;

    @Transactional(readOnly = true)
    public List<CompanyDto> list(Boolean isActive) {
        return repo.findAll().stream()
                .filter(c -> isActive == null || c.isActive() == isActive)
                .map(CompanyService::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public CompanyDto get(Long id) {
        return toDto(load(id));
    }

    /** Empleados (cualquier rol) asignados a esta empresa del catálogo. */
    @Transactional(readOnly = true)
    public List<WorkerDto> listWorkers(Long companyId) {
        // Verifica primero que la empresa existe — devuelve 404 si no.
        load(companyId);
        return workerRepo.findByCompany_IdOrderByFullNameAsc(companyId).stream()
                .map(WorkerDto::from)
                .toList();
    }

    @Transactional
    public CompanyDto create(CompanyUpsertDto dto) {
        repo.findByName(dto.name()).ifPresent(c -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe una empresa con ese nombre");
        });
        Company c = Company.builder()
                .name(dto.name())
                .type(dto.type())
                .phone(dto.phone())
                .email(dto.email())
                .managerPerson(dto.managerPersonId() != null ? loadManagerOrThrow(dto.managerPersonId()) : null)
                .managerNotes(dto.managerNotes())
                .isActive(dto.isActive() == null || dto.isActive())
                .build();
        return toDto(repo.save(c));
    }

    @Transactional
    public CompanyDto update(Long id, CompanyUpsertDto dto) {
        Company c = load(id);
        // Si cambia el name, valida que no haya colisión con otro.
        if (!c.getName().equals(dto.name())) {
            repo.findByName(dto.name()).ifPresent(other -> {
                if (!other.getId().equals(id)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Ya existe otra empresa con ese nombre");
                }
            });
            c.setName(dto.name());
        }
        c.setType(dto.type());
        c.setPhone(dto.phone());
        c.setEmail(dto.email());
        c.setManagerPerson(dto.managerPersonId() != null ? loadManagerOrThrow(dto.managerPersonId()) : null);
        c.setManagerNotes(dto.managerNotes());
        if (dto.isActive() != null) c.setActive(dto.isActive());
        return toDto(repo.save(c));
    }

    @Transactional
    public void delete(Long id) {
        Company c = load(id);
        // Borrado lógico — preserva referencias históricas en pos_persons.
        c.setActive(false);
        repo.save(c);
    }

    // ---- helpers ----

    private Company load(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Empresa no encontrada"));
    }

    private Worker loadManagerOrThrow(Long personId) {
        Worker w = workerRepo.findById(personId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "Persona manager no encontrada"));
        if (!w.isCompanyManager()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "La persona seleccionada no está marcada como manager de empresa (is_company_manager=false)");
        }
        return w;
    }

    static CompanyDto toDto(Company c) {
        Worker mgr = c.getManagerPerson();
        return new CompanyDto(
                c.getId(),
                c.getName(),
                c.getType(),
                c.getPhone(),
                c.getEmail(),
                mgr != null ? mgr.getId() : null,
                mgr != null ? mgr.getFullName() : null,
                mgr != null ? mgr.getPhone() : null,
                mgr != null ? mgr.getEmail() : null,
                c.getManagerNotes(),
                c.isActive()
        );
    }
}
