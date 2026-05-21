package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.company.Company;
import com.lci.rtls.positioning.company.CompanyRepository;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.tag.dto.TagDto;
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
    private final CompanyRepository companyRepo;
    private final TagRepository tagRepo;

    @Transactional(readOnly = true)
    public Page<WorkerDto> list(String search, CompanyType companyType, Boolean isActive,
                                WorkerSpecifications.RoleFilter roleFilter, Pageable pageable) {
        return repo.findAll(
                WorkerSpecifications.withFilters(search, companyType, isActive, roleFilter),
                pageable
        ).map(WorkerDto::from);
    }

    @Transactional(readOnly = true)
    public WorkerDto getById(Long id) {
        return WorkerDto.from(loadOrFail(id));
    }

    /** Tag asignado al worker (puede ser null). Lo expone como TagDto plano. */
    @Transactional(readOnly = true)
    public TagDto getAssignedTag(Long workerId) {
        loadOrFail(workerId); // valida que el worker exista
        return tagRepo.findByAssignedWorker_Id(workerId)
                .map(TagDto::from)
                .orElse(null);
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
                // V13: defaults razonables si el cliente no los manda
                .workerInPlant(dto.isWorkerInPlant() == null || dto.isWorkerInPlant())
                .supervisor(Boolean.TRUE.equals(dto.isSupervisor()))
                .companyManager(Boolean.TRUE.equals(dto.isCompanyManager()))
                .lastPrlTrainingDate(dto.lastPrlTrainingDate())
                .prlValidMonths(dto.prlValidMonths() == null ? 12 : dto.prlValidMonths())
                .supervisorNotes(dto.supervisorNotes())
                .build();
        applyRelations(w, dto.supervisorId(), dto.backupSupervisorId(), dto.companyId());
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
        // V13: solo actualizamos los flags/relaciones si vienen en el payload
        // (Boolean null = "no tocar"). Esto permite a la UI mandar updates
        // parciales sin sobreescribir flags que no controla.
        if (dto.isWorkerInPlant() != null) w.setWorkerInPlant(dto.isWorkerInPlant());
        if (dto.isSupervisor() != null) w.setSupervisor(dto.isSupervisor());
        if (dto.isCompanyManager() != null) w.setCompanyManager(dto.isCompanyManager());
        if (dto.lastPrlTrainingDate() != null) w.setLastPrlTrainingDate(dto.lastPrlTrainingDate());
        if (dto.prlValidMonths() != null) w.setPrlValidMonths(dto.prlValidMonths());
        if (dto.supervisorNotes() != null) w.setSupervisorNotes(dto.supervisorNotes());
        applyRelations(w, dto.supervisorId(), dto.backupSupervisorId(), dto.companyId());
        return WorkerDto.from(repo.save(w));
    }

    /**
     * Aplica los FK opcionales {@code supervisorId / backupSupervisorId / companyId}
     * resolviéndolos a entidades. {@code null} = "no tocar" en update. Si la persona
     * referenciada no existe, devuelve 400 al cliente.
     */
    private void applyRelations(Worker w, Long supervisorId, Long backupSupervisorId, Long companyId) {
        if (supervisorId != null) {
            w.setSupervisorPerson(loadSupervisorOrThrow(supervisorId));
        }
        if (backupSupervisorId != null) {
            w.setBackupSupervisorPerson(loadSupervisorOrThrow(backupSupervisorId));
        }
        if (companyId != null) {
            w.setCompany(loadCompanyOrThrow(companyId));
        }
    }

    private Worker loadSupervisorOrThrow(Long id) {
        Worker s = repo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "Persona supervisor " + id + " no encontrada"));
        if (!s.isSupervisor()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Persona " + id + " no está marcada como supervisor (is_supervisor=false)");
        }
        return s;
    }

    private Company loadCompanyOrThrow(Long id) {
        return companyRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empresa " + id + " no encontrada"));
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

    // ---- Auto-generación de códigos de empleado ----
    //
    // El patrón es {@code EMP-#####}. Buscamos el mayor número usado en códigos
    // existentes y devolvemos +1. Si la base de datos está vacía, empezamos en
    // EMP-00001. No bloquea la creación: si el admin escribe su propio código,
    // se valida por unicidad como hasta ahora.

    private static final java.util.regex.Pattern EMP_CODE_PATTERN =
            java.util.regex.Pattern.compile("^EMP-(\\d+)$");

    @Transactional(readOnly = true)
    public String suggestNextEmployeeCode() {
        int maxNum = 0;
        for (Worker w : repo.findAll()) {
            String code = w.getEmployeeCode();
            if (code == null) continue;
            java.util.regex.Matcher m = EMP_CODE_PATTERN.matcher(code);
            if (m.matches()) {
                try {
                    int n = Integer.parseInt(m.group(1));
                    if (n > maxNum) maxNum = n;
                } catch (NumberFormatException ignored) {
                    // códigos con número fuera de rango: ignorar
                }
            }
        }
        return String.format("EMP-%05d", maxNum + 1);
    }

    @Transactional(readOnly = true)
    public boolean isEmployeeCodeAvailable(String code) {
        if (code == null || code.isBlank()) return false;
        return !repo.existsByEmployeeCode(code);
    }
}
