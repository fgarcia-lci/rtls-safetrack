package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.worker.dto.WorkerCreateDto;
import com.lci.rtls.positioning.worker.dto.WorkerDto;
import com.lci.rtls.positioning.worker.dto.WorkerUpdateDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkerService {

    private final WorkerRepository repo;

    @Transactional(readOnly = true)
    public Page<WorkerDto> list(String search, CompanyType companyType, Boolean isActive, Pageable pageable) {
        return repo.findAll(WorkerSpecifications.withFilters(search, companyType, isActive), pageable)
                .map(WorkerDto::from);
    }

    @Transactional(readOnly = true)
    public WorkerDto getById(Long id) {
        return WorkerDto.from(loadOrFail(id));
    }

    @Transactional
    public WorkerDto create(WorkerCreateDto dto) {
        if (repo.existsByEmployeeCode(dto.employeeCode())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "employeeCode '" + dto.employeeCode() + "' ya existe");
        }
        Worker w = Worker.builder()
                .employeeCode(dto.employeeCode())
                .fullName(dto.fullName())
                .phone(dto.phone())
                .email(dto.email())
                .companyName(dto.companyName())
                .companyType(dto.companyType())
                .roleInPlant(dto.roleInPlant())
                .linkedUserId(dto.linkedUserId())
                .supervisorUserId(dto.supervisorUserId())
                .hireDate(dto.hireDate())
                .photoUrl(dto.photoUrl())
                .isActive(true)
                .notes(dto.notes())
                .build();
        Worker saved = repo.save(w);
        log.info("Worker creado id={} employeeCode={}", saved.getId(), saved.getEmployeeCode());
        return WorkerDto.from(saved);
    }

    @Transactional
    public WorkerDto update(Long id, WorkerUpdateDto dto) {
        Worker w = loadOrFail(id);
        w.setFullName(dto.fullName());
        w.setPhone(dto.phone());
        w.setEmail(dto.email());
        w.setCompanyName(dto.companyName());
        w.setCompanyType(dto.companyType());
        w.setRoleInPlant(dto.roleInPlant());
        w.setLinkedUserId(dto.linkedUserId());
        w.setSupervisorUserId(dto.supervisorUserId());
        w.setHireDate(dto.hireDate());
        w.setPhotoUrl(dto.photoUrl());
        w.setActive(dto.isActive());
        w.setNotes(dto.notes());
        return WorkerDto.from(repo.save(w));
    }

    @Transactional
    public void softDelete(Long id) {
        Worker w = loadOrFail(id);
        if (w.isActive()) {
            w.setActive(false);
            repo.save(w);
            log.info("Worker dado de baja id={} employeeCode={}", w.getId(), w.getEmployeeCode());
        }
    }

    private Worker loadOrFail(Long id) {
        return repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker " + id + " no encontrado"));
    }
}
