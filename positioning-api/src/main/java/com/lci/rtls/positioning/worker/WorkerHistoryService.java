package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.ingestion.document.TagPositionHistory;
import com.lci.rtls.positioning.ingestion.repository.TagPositionHistoryRepository;
import com.lci.rtls.positioning.sos.SosEvent;
import com.lci.rtls.positioning.sos.SosEventRepository;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.dto.WorkerHistoryDto;
import com.lci.rtls.positioning.zone.ProximityEvent;
import com.lci.rtls.positioning.zone.ProximityEventRepository;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.SafetyZoneRepository;
import com.lci.rtls.positioning.zone.ZoneType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Compone la respuesta del endpoint {@code GET /v1/workers/{id}/history} —
 * une posiciones (Mongo) + eventos de proximidad (MySQL) + SOS + tiempo en
 * zona, en un solo DTO listo para la ficha de trabajador.
 *
 * <p>Downsampling: si el rango es grande (>= 1 día), reducimos a 1 muestra
 * cada N segundos para no devolver millones de puntos. La UI puede pedir
 * resolución fina con {@code resolutionSeconds}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkerHistoryService {

    private final WorkerRepository workerRepo;
    private final TagRepository tagRepo;
    private final TagPositionHistoryRepository positionsRepo;
    private final ProximityEventRepository proximityRepo;
    private final SosEventRepository sosRepo;
    private final SafetyZoneRepository zoneRepo;

    @Value("${rtls.retention.positions-history-days:7}")
    private int positionsHistoryDays;

    @Transactional(readOnly = true)
    public WorkerHistoryDto getHistory(Long workerId, Instant from, Instant to, Integer resolutionSeconds) {
        Worker w = workerRepo.findById(workerId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Trabajador no encontrado"));

        // Defensive cap — no permitir consultar más allá de la retención.
        Instant retentionFloor = Instant.now().minus(Duration.ofDays(positionsHistoryDays + 1));
        if (from.isBefore(retentionFloor)) {
            from = retentionFloor;
        }
        if (!to.isAfter(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' debe ser posterior a 'from'");
        }
        long rangeSeconds = Duration.between(from, to).toSeconds();
        int resolution = resolutionSeconds != null && resolutionSeconds > 0
                ? resolutionSeconds
                : autoResolution(rangeSeconds);

        // Posiciones: source mongo a través del tag actualmente asignado.
        // Si históricamente llevó varios tags, sólo recoge el tag activo en el
        // momento del query. Limitación conocida — se documenta en #110.
        List<WorkerHistoryDto.PositionPoint> positions = loadPositions(w, from, to, resolution);

        // Eventos de proximidad y SOS en el rango.
        List<ProximityEvent> proxRaw = proximityRepo
                .findByWorkerIdAndEnteredAtBetweenOrderByEnteredAtAsc(workerId, from, to);
        List<SosEvent> sosRaw = sosRepo.findByWorkerAndDateRange(workerId, from, to);

        // Cargar las zonas referenciadas en los eventos para enriquecer el DTO.
        Map<Long, SafetyZone> zonesById = new HashMap<>();
        proxRaw.stream().map(ProximityEvent::getZoneId).distinct().forEach(zid ->
                zoneRepo.findById(zid).ifPresent(z -> zonesById.put(z.getId(), z)));

        List<WorkerHistoryDto.HistoryProximityEvent> proxDto = proxRaw.stream()
                .map(e -> {
                    SafetyZone z = zonesById.get(e.getZoneId());
                    return new WorkerHistoryDto.HistoryProximityEvent(
                            e.getId(),
                            e.getZoneId(),
                            z != null ? z.getCode() : null,
                            z != null ? z.getName() : null,
                            z != null ? z.getType() : null,
                            e.getMaxSeverity(),
                            e.getEnteredAt(),
                            e.getExitedAt(),
                            e.getDurationSec(),
                            e.getAcknowledgedAt() != null);
                })
                .toList();

        List<WorkerHistoryDto.HistorySosEvent> sosDto = sosRaw.stream()
                .map(s -> new WorkerHistoryDto.HistorySosEvent(
                        s.getId(),
                        s.getTriggeredAt(),
                        s.getResolvedAt(),
                        s.getStatus().name()))
                .toList();

        // Tiempo en zona — agrupado a partir de los eventos (no necesitamos
        // re-scan de posiciones porque ProximityEvent ya tiene duración).
        List<WorkerHistoryDto.TimeInZone> timeInZones = computeTimeInZones(proxRaw, zonesById);

        // Conteos para KPIs del periodo.
        WorkerHistoryDto.EventCounts counts = computeCounts(proxRaw, sosRaw, zonesById);

        return new WorkerHistoryDto(workerId, from, to, positions, proxDto, sosDto, timeInZones, counts);
    }

    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------

    /** Heurística: un rango de 1h → 5s; 1 día → 60s; 1 semana → 300s. */
    private int autoResolution(long rangeSeconds) {
        if (rangeSeconds <= 3600) return 5;
        if (rangeSeconds <= 86400) return 60;
        return 300;
    }

    private List<WorkerHistoryDto.PositionPoint> loadPositions(Worker w, Instant from, Instant to, int resolution) {
        // Buscamos un tag asignado actualmente al worker para obtener su serial.
        Optional<Tag> tag = tagRepo.findAll().stream()
                .filter(t -> t.getAssignedWorker() != null && t.getAssignedWorker().getId().equals(w.getId()))
                .findFirst();
        if (tag.isEmpty()) {
            return List.of();
        }
        List<TagPositionHistory> raw = positionsRepo
                .findByTagIdAndTsBetweenOrderByTsAsc(tag.get().getSerial(), from, to);
        if (raw.isEmpty()) return List.of();

        // Downsample a `resolution` segundos.
        List<WorkerHistoryDto.PositionPoint> out = new ArrayList<>();
        Instant nextSampleAt = raw.get(0).getTs();
        for (TagPositionHistory p : raw) {
            if (!p.getTs().isBefore(nextSampleAt)) {
                out.add(new WorkerHistoryDto.PositionPoint(p.getTs(), p.getX(), p.getY(), p.getZ()));
                nextSampleAt = p.getTs().plus(Duration.ofSeconds(resolution));
            }
        }
        return out;
    }

    private List<WorkerHistoryDto.TimeInZone> computeTimeInZones(List<ProximityEvent> events,
                                                                  Map<Long, SafetyZone> zonesById) {
        Map<Long, long[]> agg = new HashMap<>();   // zoneId → [secondsTotal, entriesCount]
        for (ProximityEvent e : events) {
            long secs = e.getDurationSec() != null ? e.getDurationSec() : 0L;
            agg.compute(e.getZoneId(), (k, v) -> v == null
                    ? new long[]{secs, 1L}
                    : new long[]{v[0] + secs, v[1] + 1L});
        }
        return agg.entrySet().stream()
                .map(en -> {
                    SafetyZone z = zonesById.get(en.getKey());
                    return new WorkerHistoryDto.TimeInZone(
                            en.getKey(),
                            z != null ? z.getCode() : null,
                            z != null ? z.getName() : null,
                            z != null ? z.getType() : null,
                            en.getValue()[0],
                            (int) en.getValue()[1]);
                })
                .sorted((a, b) -> Long.compare(b.secondsInside(), a.secondsInside()))
                .toList();
    }

    private WorkerHistoryDto.EventCounts computeCounts(List<ProximityEvent> events,
                                                        List<SosEvent> sos,
                                                        Map<Long, SafetyZone> zonesById) {
        long danger = 0, restricted = 0, warning = 0, other = 0, dangerSec = 0;
        for (ProximityEvent e : events) {
            SafetyZone z = zonesById.get(e.getZoneId());
            ZoneType type = z != null ? z.getType() : null;
            long secs = e.getDurationSec() != null ? e.getDurationSec() : 0L;
            if (type == ZoneType.DANGER) { danger++; dangerSec += secs; }
            else if (type == ZoneType.RESTRICTED) restricted++;
            else if (type == ZoneType.WARNING) warning++;
            else other++;
        }
        return new WorkerHistoryDto.EventCounts(danger, restricted, warning, other, sos.size(), dangerSec);
    }
}
