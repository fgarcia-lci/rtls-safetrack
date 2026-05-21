package com.lci.rtls.positioning.events;

import com.lci.rtls.positioning.events.dto.EventCommentDto;
import com.lci.rtls.positioning.events.dto.EventDetailDto;
import com.lci.rtls.positioning.sos.SosEvent;
import com.lci.rtls.positioning.sos.SosEventRepository;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.worker.WorkerRepository;
import com.lci.rtls.positioning.zone.ProximityEvent;
import com.lci.rtls.positioning.zone.ProximityEventRepository;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.SafetyZoneRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class EventDetailService {

    private final ProximityEventRepository proximityRepo;
    private final SosEventRepository sosRepo;
    private final SafetyZoneRepository zoneRepo;
    private final WorkerRepository workerRepo;
    private final TagRepository tagRepo;
    private final EventCommentRepository commentRepo;

    @Transactional(readOnly = true)
    public EventDetailDto getDetail(String eventType, Long eventId) {
        EventComment.EventType type = parseType(eventType);
        return switch (type) {
            case PROXIMITY -> buildProximity(eventId);
            case SOS       -> buildSos(eventId);
        };
    }

    @Transactional
    public EventCommentDto addComment(String eventType, Long eventId,
                                       String username, String displayName, String text) {
        EventComment.EventType type = parseType(eventType);
        // Validamos que el evento existe — no queremos comentarios huérfanos.
        if (type == EventComment.EventType.PROXIMITY) {
            proximityRepo.findById(eventId).orElseThrow(() ->
                    new ResponseStatusException(HttpStatus.NOT_FOUND, "Evento de proximidad no encontrado"));
        } else {
            sosRepo.findById(eventId).orElseThrow(() ->
                    new ResponseStatusException(HttpStatus.NOT_FOUND, "Evento SOS no encontrado"));
        }
        EventComment c = EventComment.builder()
                .eventType(type)
                .eventId(eventId)
                .authorUsername(username)
                .authorDisplay(displayName)
                .commentText(text)
                .build();
        return EventCommentDto.from(commentRepo.save(c));
    }

    // ---- builders ----

    private EventDetailDto buildProximity(Long id) {
        ProximityEvent e = proximityRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Evento de proximidad no encontrado"));
        SafetyZone z = e.getZoneId() != null ? zoneRepo.findById(e.getZoneId()).orElse(null) : null;
        Worker w = e.getWorkerId() != null ? workerRepo.findById(e.getWorkerId()).orElse(null) : null;
        Tag t = e.getTagId() != null ? tagRepo.findById(e.getTagId()).orElse(null) : null;
        List<EventCommentDto> comments = commentRepo
                .findByEventTypeAndEventIdOrderByCreatedAtAsc(EventComment.EventType.PROXIMITY, id)
                .stream().map(EventCommentDto::from).toList();
        return new EventDetailDto(
                "PROXIMITY", id,
                e.getEnteredAt(),
                e.getExitedAt(),
                e.getDurationSec(),
                e.getPlantId(),
                e.getZoneId(),
                z != null ? z.getCode() : null,
                z != null ? z.getName() : null,
                z != null ? z.getType() : null,
                e.getMaxSeverity(),
                e.getAuthorized(),
                null, // sosStatus
                null, null, // ackedAt/By no aplica a proximity (sí acknowledgedAt/By)
                null, null, null, // help (no aplica)
                null, null, null, // resolve (no aplica)
                null, null, null, // cancel (no aplica)
                workerId(w), workerCode(w), workerName(w),
                workerCompanyName(w), workerCompanyType(w), workerPhoto(w),
                tagId(t), tagSerial(t), tagModel(t), tagBattery(t), tagState(t), tagLastSeen(t),
                comments
        );
    }

    private EventDetailDto buildSos(Long id) {
        SosEvent s = sosRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Evento SOS no encontrado"));
        Worker w = s.getWorkerId() != null ? workerRepo.findById(s.getWorkerId()).orElse(null) : null;
        Tag t = s.getTagId() != null ? tagRepo.findById(s.getTagId()).orElse(null) : null;
        // Duración: resolvedAt o cancelledAt como cierre.
        Instant closedAt = s.getResolvedAt() != null ? s.getResolvedAt() : s.getCancelledAt();
        Integer durationSec = closedAt != null
                ? (int) java.time.Duration.between(s.getTriggeredAt(), closedAt).toSeconds()
                : null;
        List<EventCommentDto> comments = commentRepo
                .findByEventTypeAndEventIdOrderByCreatedAtAsc(EventComment.EventType.SOS, id)
                .stream().map(EventCommentDto::from).toList();
        return new EventDetailDto(
                "SOS", id,
                s.getTriggeredAt(),
                closedAt,
                durationSec,
                s.getPlantId(),
                null, null, null, null, null, null, // proximity-specific
                s.getStatus() != null ? s.getStatus().name() : null,
                s.getAckedAt(), s.getAckedBy(),
                s.getHelpSentAt(), s.getHelpSentBy(), s.getHelpNotes(),
                s.getResolvedAt(), s.getResolvedBy(), s.getResolutionNotes(),
                s.getCancelledAt(), s.getCancelledBy(), s.getCancelReason(),
                workerId(w), workerCode(w), workerName(w),
                workerCompanyName(w), workerCompanyType(w), workerPhoto(w),
                tagId(t), tagSerial(t), tagModel(t), tagBattery(t), tagState(t), tagLastSeen(t),
                comments
        );
    }

    // ---- helpers ----

    private static EventComment.EventType parseType(String s) {
        try {
            return EventComment.EventType.valueOf(s.toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Tipo de evento inválido: " + s + " (esperado PROXIMITY o SOS)");
        }
    }

    private static Long workerId(Worker w) { return w == null ? null : w.getId(); }
    private static String workerCode(Worker w) { return w == null ? null : w.getEmployeeCode(); }
    private static String workerName(Worker w) { return w == null ? null : w.getFullName(); }
    private static String workerCompanyName(Worker w) { return w == null ? null : w.getCompanyName(); }
    private static com.lci.rtls.positioning.worker.CompanyType workerCompanyType(Worker w) { return w == null ? null : w.getCompanyType(); }
    private static String workerPhoto(Worker w) { return w == null ? null : w.getPhotoUrl(); }

    private static Long tagId(Tag t) { return t == null ? null : t.getId(); }
    private static String tagSerial(Tag t) { return t == null ? null : t.getSerial(); }
    private static String tagModel(Tag t) { return t == null ? null : t.getModel(); }
    private static Integer tagBattery(Tag t) { return t == null ? null : t.getBatteryLastPct(); }
    private static com.lci.rtls.positioning.tag.TagState tagState(Tag t) { return t == null ? null : t.getState(); }
    private static Instant tagLastSeen(Tag t) { return t == null ? null : t.getLastSeenAt(); }
}
