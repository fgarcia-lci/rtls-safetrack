package com.lci.rtls.positioning.tag;

import com.lci.rtls.positioning.tag.dto.TagCreateDto;
import com.lci.rtls.positioning.tag.dto.TagDto;
import com.lci.rtls.positioning.tag.dto.TagUpdateDto;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.worker.WorkerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

@Service
@RequiredArgsConstructor
@Slf4j
public class TagService {

    private final TagRepository tagRepo;
    private final WorkerRepository workerRepo;

    @Transactional(readOnly = true)
    public Page<TagDto> list(String search, String plantId, TagState state, Boolean isAssigned, Pageable pageable) {
        return tagRepo.findAll(TagSpecifications.withFilters(search, plantId, state, isAssigned), pageable)
                .map(TagDto::from);
    }

    @Transactional(readOnly = true)
    public TagDto getById(Long id) {
        return TagDto.from(loadOrFail(id));
    }

    @Transactional(readOnly = true)
    public TagDto getBySerial(String serial) {
        return TagDto.from(tagRepo.findBySerial(serial).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Tag con serial '" + serial + "' no encontrado")));
    }

    @Transactional
    public TagDto create(TagCreateDto dto) {
        if (tagRepo.existsBySerial(dto.serial())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Tag con serial '" + dto.serial() + "' ya existe");
        }
        Tag t = Tag.builder()
                .serial(dto.serial())
                .model(dto.model())
                .vendor(dto.vendor())
                .firmwareVersion(dto.firmwareVersion())
                .plantId(dto.plantId())
                .notes(dto.notes())
                .state(TagState.UNKNOWN)
                .build();
        Tag saved = tagRepo.save(t);
        log.info("Tag creado id={} serial={}", saved.getId(), saved.getSerial());
        return TagDto.from(saved);
    }

    @Transactional
    public TagDto update(Long id, TagUpdateDto dto) {
        Tag t = loadOrFail(id);
        t.setModel(dto.model());
        t.setVendor(dto.vendor());
        t.setFirmwareVersion(dto.firmwareVersion());
        t.setPlantId(dto.plantId());
        t.setNotes(dto.notes());
        return TagDto.from(tagRepo.save(t));
    }

    @Transactional
    public void decommission(Long id) {
        Tag t = loadOrFail(id);
        if (t.getState() != TagState.DECOMMISSIONED) {
            t.setState(TagState.DECOMMISSIONED);
            t.setAssignedWorker(null);
            t.setAssignedAt(null);
            tagRepo.save(t);
            log.info("Tag dado de baja id={} serial={}", t.getId(), t.getSerial());
        }
    }

    @Transactional
    public TagDto assign(Long tagId, Long workerId) {
        Tag t = loadOrFail(tagId);
        if (t.getState() == TagState.DECOMMISSIONED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No se puede asignar un tag decomisionado");
        }
        Worker w = workerRepo.findById(workerId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Worker " + workerId + " no encontrado"));
        if (!w.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Worker " + workerId + " está inactivo, no se le puede asignar un tag");
        }
        t.setAssignedWorker(w);
        t.setAssignedAt(Instant.now());
        Tag saved = tagRepo.save(t);
        log.info("Tag id={} serial={} asignado a worker id={} ({})",
                t.getId(), t.getSerial(), w.getId(), w.getEmployeeCode());
        return TagDto.from(saved);
    }

    @Transactional
    public TagDto unassign(Long tagId) {
        Tag t = loadOrFail(tagId);
        if (t.getAssignedWorker() == null) {
            return TagDto.from(t);
        }
        Long previousWorkerId = t.getAssignedWorker().getId();
        t.setAssignedWorker(null);
        t.setAssignedAt(null);
        Tag saved = tagRepo.save(t);
        log.info("Tag id={} serial={} desasignado (estaba en worker id={})",
                t.getId(), t.getSerial(), previousWorkerId);
        return TagDto.from(saved);
    }

    private Tag loadOrFail(Long id) {
        return tagRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Tag " + id + " no encontrado"));
    }
}
