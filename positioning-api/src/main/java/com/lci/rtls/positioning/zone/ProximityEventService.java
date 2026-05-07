package com.lci.rtls.positioning.zone;

import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.worker.WorkerRepository;
import com.lci.rtls.positioning.zone.dto.ProximityEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Lógica de lectura y ACK de {@link ProximityEvent}s.
 *
 * <p>El motor ({@code ZoneEngineService}) es quien crea/cierra eventos. Este
 * service expone listado para el panel de alertas y el endpoint de
 * acknowledge. La carga de tag/worker/zone se hace agrupada para evitar N+1.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProximityEventService {

    private final ProximityEventRepository eventRepo;
    private final TagRepository tagRepo;
    private final WorkerRepository workerRepo;
    private final SafetyZoneRepository zoneRepo;

    @Transactional(readOnly = true)
    public List<ProximityEventDto> listOpenByPlant(String plantId) {
        List<ProximityEvent> events = eventRepo.findByPlantIdAndExitedAtIsNull(plantId);
        return enrichAndConvert(events);
    }

    @Transactional(readOnly = true)
    public List<ProximityEventDto> listByPlant(String plantId) {
        List<ProximityEvent> events = eventRepo.findByPlantIdOrderByEnteredAtDesc(plantId);
        return enrichAndConvert(events);
    }

    @Transactional
    public ProximityEventDto acknowledge(Long eventId) {
        ProximityEvent e = eventRepo.findById(eventId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "ProximityEvent " + eventId + " no encontrado"));
        if (e.getAcknowledgedAt() != null) {
            // Idempotente — ya estaba ACK'd, no error.
            return enrich(e);
        }
        e.setAcknowledgedAt(Instant.now());
        e.setAcknowledgedBy(currentUserId());
        ProximityEvent saved = eventRepo.save(e);
        log.info("ProximityEvent ACK eventId={} by={}", saved.getId(), saved.getAcknowledgedBy());
        return enrich(saved);
    }

    // ---- helpers ----

    private List<ProximityEventDto> enrichAndConvert(List<ProximityEvent> events) {
        if (events.isEmpty()) return List.of();
        // Carga en bloque para evitar N+1.
        Set<Long> tagIds = events.stream().map(ProximityEvent::getTagId).filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Set<Long> workerIds = events.stream().map(ProximityEvent::getWorkerId).filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Set<Long> zoneIds = events.stream().map(ProximityEvent::getZoneId).filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());

        Map<Long, Tag> tagsById = new HashMap<>();
        tagRepo.findAllById(tagIds).forEach(t -> tagsById.put(t.getId(), t));
        Map<Long, Worker> workersById = new HashMap<>();
        workerRepo.findAllById(workerIds).forEach(w -> workersById.put(w.getId(), w));
        Map<Long, SafetyZone> zonesById = new HashMap<>();
        zoneRepo.findAllById(zoneIds).forEach(z -> zonesById.put(z.getId(), z));

        return events.stream().map(e -> ProximityEventDto.from(
                e,
                tagsById.get(e.getTagId()),
                e.getWorkerId() != null ? workersById.get(e.getWorkerId()) : null,
                zonesById.get(e.getZoneId())
        )).toList();
    }

    private ProximityEventDto enrich(ProximityEvent e) {
        Tag tag = tagRepo.findById(e.getTagId()).orElse(null);
        Worker worker = e.getWorkerId() != null ? workerRepo.findById(e.getWorkerId()).orElse(null) : null;
        SafetyZone zone = zoneRepo.findById(e.getZoneId()).orElse(null);
        return ProximityEventDto.from(e, tag, worker, zone);
    }

    private String currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return null;
        return auth.getName(); // sub del JWT
    }
}
