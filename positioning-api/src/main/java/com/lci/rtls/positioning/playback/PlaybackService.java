package com.lci.rtls.positioning.playback;

import com.lci.rtls.positioning.ingestion.document.TagPositionHistory;
import com.lci.rtls.positioning.ingestion.repository.TagPositionHistoryRepository;
import com.lci.rtls.positioning.sos.SosEvent;
import com.lci.rtls.positioning.sos.SosEventRepository;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.zone.ProximityEvent;
import com.lci.rtls.positioning.zone.ProximityEventRepository;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.SafetyZoneRepository;
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

/**
 * Genera el batch del reproductor temporal: todas las trayectorias de los
 * tags activos en la planta + proximityEvents + SOS dentro del rango pedido.
 *
 * <p>Hard limit: 24h por petición. Si {@code to-from > 24h} devuelve 400.
 *
 * <p>Downsampling: si no se especifica {@code resolutionSeconds}, se elige
 * automáticamente según el rango (5s/60s/300s).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PlaybackService {

    private static final long MAX_RANGE_SECONDS = 24 * 3600;

    private final TagRepository tagRepo;
    private final TagPositionHistoryRepository positionsRepo;
    private final ProximityEventRepository proximityRepo;
    private final SosEventRepository sosRepo;
    private final SafetyZoneRepository zoneRepo;

    @Value("${rtls.retention.positions-history-days:7}")
    private int positionsHistoryDays;

    @Transactional(readOnly = true)
    public PlaybackDto getPlayback(String plantId, Instant from, Instant to, Integer resolutionSeconds) {
        // Retention cap.
        Instant retentionFloor = Instant.now().minus(Duration.ofDays(positionsHistoryDays + 1));
        if (from.isBefore(retentionFloor)) {
            from = retentionFloor;
        }
        if (!to.isAfter(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' debe ser posterior a 'from'");
        }
        long rangeSeconds = Duration.between(from, to).toSeconds();
        if (rangeSeconds > MAX_RANGE_SECONDS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Rango máximo de reproducción: 24h (pedido: " + (rangeSeconds / 3600) + "h)");
        }
        int resolution = resolutionSeconds != null && resolutionSeconds > 0
                ? resolutionSeconds
                : autoResolution(rangeSeconds);

        // Tags asignados a workers en esta planta. Filtramos por planta porque
        // un tag pertenece a una planta concreta (campo plantId del Tag).
        List<Tag> assignedTags = tagRepo.findAll().stream()
                .filter(t -> plantId.equals(t.getPlantId()))
                .filter(t -> t.getAssignedWorker() != null)
                .toList();

        // Acumular workerIds para luego cargar sus eventos.
        List<Long> workerIds = assignedTags.stream()
                .map(t -> t.getAssignedWorker().getId())
                .distinct()
                .toList();

        // Pre-carga zonas referenciadas en eventos (lo hacemos después de tener
        // los eventos; aquí solo prepara estructura).
        Map<Long, SafetyZone> zonesById = new HashMap<>();

        // Trayectorias por worker.
        List<PlaybackDto.PlaybackWorker> workers = new ArrayList<>();
        for (Tag tag : assignedTags) {
            Worker w = tag.getAssignedWorker();
            List<TagPositionHistory> raw = positionsRepo
                    .findByTagIdAndTsBetweenOrderByTsAsc(tag.getSerial(), from, to);
            List<PlaybackDto.PositionPoint> downsampled = downsample(raw, resolution);
            if (downsampled.isEmpty()) {
                // Igualmente listamos el worker — el frontend lo pintará si
                // tiene eventos aunque no haya posiciones (raro pero posible).
            }
            workers.add(new PlaybackDto.PlaybackWorker(
                    w.getId(),
                    w.getEmployeeCode(),
                    w.getFullName(),
                    w.getCompanyName(),
                    w.getCompanyType(),
                    w.getPhotoUrl(),
                    tag.getSerial(),
                    downsampled
            ));
        }

        // Proximity events de TODOS los workers de la planta en el rango.
        // No hay método by-plant; usamos by-worker en bucle.
        List<PlaybackDto.PlaybackProximityEvent> proxOut = new ArrayList<>();
        for (Long wid : workerIds) {
            List<ProximityEvent> rows = proximityRepo
                    .findByWorkerIdAndEnteredAtBetweenOrderByEnteredAtAsc(wid, from, to);
            for (ProximityEvent e : rows) {
                SafetyZone z = zonesById.computeIfAbsent(e.getZoneId(),
                        zid -> zoneRepo.findById(zid).orElse(null));
                proxOut.add(new PlaybackDto.PlaybackProximityEvent(
                        e.getId(),
                        wid,
                        e.getZoneId(),
                        z != null ? z.getCode() : null,
                        z != null ? z.getName() : null,
                        z != null ? z.getType() : null,
                        e.getMaxSeverity(),
                        e.getEnteredAt(),
                        e.getExitedAt(),
                        e.getDurationSec()
                ));
            }
        }

        // SOS events por planta — reusa el repo por worker porque no hay
        // método by-plant directo.
        // Para el "tiempo de cierre" en el replay usamos COALESCE(resolved,
        // cancelled): un SOS marcado como falso positivo vía cancel() en
        // versiones antiguas no poblaba resolvedAt, y el frontend lo
        // mostraba activo hasta el final del rango. cancelledAt sirve igual
        // como instante de cierre temporal de cara al timeline.
        List<PlaybackDto.PlaybackSosEvent> sosOut = new ArrayList<>();
        for (Long wid : workerIds) {
            List<SosEvent> rows = sosRepo.findByWorkerAndDateRange(wid, from, to);
            for (SosEvent s : rows) {
                Instant closedAt = s.getResolvedAt() != null
                        ? s.getResolvedAt()
                        : s.getCancelledAt();
                sosOut.add(new PlaybackDto.PlaybackSosEvent(
                        s.getId(),
                        wid,
                        s.getTriggeredAt(),
                        closedAt,
                        s.getStatus().name()
                ));
            }
        }

        log.info("[playback] plant={} from={} to={} workers={} positions={} prox={} sos={} res={}s",
                plantId, from, to, workers.size(),
                workers.stream().mapToInt(w -> w.positions().size()).sum(),
                proxOut.size(), sosOut.size(), resolution);

        return new PlaybackDto(plantId, from, to, resolution, workers, proxOut, sosOut);
    }

    // ----------------------------------------------------------------------

    /** Heurística igual que WorkerHistoryService: 1h→5s, 1d→60s, ≥1d→300s. */
    private int autoResolution(long rangeSeconds) {
        if (rangeSeconds <= 3600) return 5;
        if (rangeSeconds <= 86400) return 60;
        return 300;
    }

    /** Downsample a 1 muestra cada {@code resolutionSeconds} (greedy). */
    private List<PlaybackDto.PositionPoint> downsample(List<TagPositionHistory> raw, int resolution) {
        if (raw.isEmpty()) return List.of();
        List<PlaybackDto.PositionPoint> out = new ArrayList<>();
        Instant nextSampleAt = raw.get(0).getTs();
        for (TagPositionHistory p : raw) {
            if (!p.getTs().isBefore(nextSampleAt)) {
                out.add(new PlaybackDto.PositionPoint(p.getTs(), p.getX(), p.getY(), p.getZ()));
                nextSampleAt = p.getTs().plus(Duration.ofSeconds(resolution));
            }
        }
        return out;
    }
}
