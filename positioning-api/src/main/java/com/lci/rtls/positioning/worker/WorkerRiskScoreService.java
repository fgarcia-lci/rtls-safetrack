package com.lci.rtls.positioning.worker;

import com.lci.rtls.positioning.sos.SosEventRepository;
import com.lci.rtls.positioning.worker.dto.RiskScoreDto;
import com.lci.rtls.positioning.zone.ProximityEvent;
import com.lci.rtls.positioning.zone.ProximityEventRepository;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.SafetyZoneRepository;
import com.lci.rtls.positioning.zone.ZoneType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Score de riesgo compuesto. Fórmula MVP — pesos pensados para que un
 * trabajador "promedio" salga ~3/10, los "reincidentes" rocen 7, y los
 * "muy preocupantes" pasen de 8.
 *
 * <pre>
 * raw = (entries_DANGER     × 5)
 *     + (entries_RESTRICTED × 3)
 *     + (entries_WARNING    × 1)
 *     + (sos_triggered      × 10)
 *     + (minutes_inside_DANGER × 0.5)
 *     × recidivism_factor   (1.0 → 1.5 si entró >3 veces a misma zona)
 *
 * normalized = clamp(raw / p90_de_la_planta × 10, 0, 10)
 * </pre>
 *
 * <p>Si el rango está vacío o no hay datos para la planta, devolvemos
 * {@code raw=0, normalized=0, level=LOW}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkerRiskScoreService {

    private static final double W_DANGER = 5.0;
    private static final double W_RESTRICTED = 3.0;
    private static final double W_WARNING = 1.0;
    private static final double W_SOS = 10.0;
    private static final double W_MINUTE_DANGER = 0.5;
    private static final int RECIDIVISM_THRESHOLD = 3;
    private static final double RECIDIVISM_FACTOR = 1.5;

    private final WorkerRepository workerRepo;
    private final ProximityEventRepository proximityRepo;
    private final SosEventRepository sosRepo;
    private final SafetyZoneRepository zoneRepo;

    @Transactional(readOnly = true)
    public RiskScoreDto compute(Long workerId, Instant from, Instant to) {
        Worker w = workerRepo.findById(workerId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Trabajador no encontrado"));
        if (!to.isAfter(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'to' debe ser posterior a 'from'");
        }

        List<ProximityEvent> events = proximityRepo
                .findByWorkerIdAndEnteredAtBetweenOrderByEnteredAtAsc(workerId, from, to);
        int sosCount = sosRepo.findByWorkerAndDateRange(workerId, from, to).size();

        // Cargar zonas para clasificar por tipo.
        Map<Long, SafetyZone> zonesById = new HashMap<>();
        events.stream().map(ProximityEvent::getZoneId).distinct()
                .forEach(zid -> zoneRepo.findById(zid).ifPresent(z -> zonesById.put(z.getId(), z)));

        // Conteo por tipo + tiempo en DANGER + entries por zona (para recidivism).
        long danger = 0, restricted = 0, warning = 0;
        long dangerSeconds = 0;
        Map<Long, Long> entriesByZone = new HashMap<>();

        for (ProximityEvent e : events) {
            entriesByZone.merge(e.getZoneId(), 1L, Long::sum);
            SafetyZone z = zonesById.get(e.getZoneId());
            ZoneType type = z != null ? z.getType() : null;
            long secs = e.getDurationSec() != null ? e.getDurationSec() : 0L;
            if (type == ZoneType.DANGER) { danger++; dangerSeconds += secs; }
            else if (type == ZoneType.RESTRICTED) restricted++;
            else if (type == ZoneType.WARNING) warning++;
        }

        boolean recidivist = entriesByZone.values().stream().anyMatch(c -> c > RECIDIVISM_THRESHOLD);
        double recidivismFactor = recidivist ? RECIDIVISM_FACTOR : 1.0;

        double dangerPts     = danger * W_DANGER;
        double restrictedPts = restricted * W_RESTRICTED;
        double warningPts    = warning * W_WARNING;
        double sosPts        = sosCount * W_SOS;
        long minutesDanger   = dangerSeconds / 60;
        double dangerTimePts = minutesDanger * W_MINUTE_DANGER;

        double raw = (dangerPts + restrictedPts + warningPts + sosPts + dangerTimePts) * recidivismFactor;

        // Normalización contra el percentil 90 de la planta en el mismo rango.
        // Si no hay nada con qué comparar, normalized = raw clamp 0..10.
        double p90 = percentile90RawScoreForPlant(w, from, to);
        double normalized = p90 > 0
                ? Math.min(10.0, raw / p90 * 10.0)
                : Math.min(10.0, raw / 10.0);   // fallback: 10 raw points = 10 normalized

        RiskScoreDto.Level level = classifyLevel(normalized);

        // Top zonas conflictivas del trabajador (5 con más entries).
        List<RiskScoreDto.TopZone> topZones = entriesByZone.entrySet().stream()
                .sorted(Map.Entry.<Long, Long>comparingByValue().reversed())
                .limit(5)
                .map(en -> {
                    SafetyZone z = zonesById.get(en.getKey());
                    return new RiskScoreDto.TopZone(
                            en.getKey(),
                            z != null ? z.getCode() : null,
                            z != null ? z.getName() : null,
                            en.getValue());
                })
                .toList();

        RiskScoreDto.Breakdown breakdown = new RiskScoreDto.Breakdown(
                danger, restricted, warning, sosCount,
                minutesDanger, recidivismFactor,
                dangerPts, restrictedPts, warningPts, sosPts, dangerTimePts);

        return new RiskScoreDto(workerId, from, to, round1(raw), round1(normalized),
                level, breakdown, topZones);
    }

    /**
     * Estima el p90 de raw score entre todos los trabajadores con actividad
     * en el rango. Si la planta tiene <10 trabajadores con eventos, el p90 no
     * es estadísticamente significativo — devolvemos 0 para que el caller use
     * el fallback de normalización.
     */
    private double percentile90RawScoreForPlant(Worker target, Instant from, Instant to) {
        // Cogemos workers de la misma planta (proximity events los tienen).
        // Para el PoC nos limitamos a workers activos en la planta del target;
        // el plant_id no está en Worker — usamos el de los eventos del propio
        // worker como heurística (vienen todos de la misma planta en práctica).
        List<Long> peers = new ArrayList<>(proximityRepo.findAll().stream()
                .filter(e -> e.getEnteredAt() != null
                        && !e.getEnteredAt().isBefore(from)
                        && e.getEnteredAt().isBefore(to)
                        && e.getWorkerId() != null)
                .map(ProximityEvent::getWorkerId)
                .distinct()
                .toList());
        if (peers.size() < 10) return 0.0;

        List<Double> scores = peers.stream()
                .map(pid -> computeRawOnly(pid, from, to))
                .sorted()
                .toList();
        int idx = (int) Math.ceil(scores.size() * 0.9) - 1;
        return scores.get(Math.max(0, Math.min(idx, scores.size() - 1)));
    }

    /** Solo el cálculo raw — para el p90, sin llamar a sí mismo recursivamente. */
    private double computeRawOnly(Long workerId, Instant from, Instant to) {
        List<ProximityEvent> events = proximityRepo
                .findByWorkerIdAndEnteredAtBetweenOrderByEnteredAtAsc(workerId, from, to);
        int sosCount = sosRepo.findByWorkerAndDateRange(workerId, from, to).size();
        Map<Long, SafetyZone> zonesById = new HashMap<>();
        events.stream().map(ProximityEvent::getZoneId).distinct()
                .forEach(zid -> zoneRepo.findById(zid).ifPresent(z -> zonesById.put(z.getId(), z)));

        long danger = 0, restricted = 0, warning = 0, dangerSecs = 0;
        Map<Long, Long> byZone = new HashMap<>();
        for (ProximityEvent e : events) {
            byZone.merge(e.getZoneId(), 1L, Long::sum);
            SafetyZone z = zonesById.get(e.getZoneId());
            ZoneType type = z != null ? z.getType() : null;
            long secs = e.getDurationSec() != null ? e.getDurationSec() : 0L;
            if (type == ZoneType.DANGER) { danger++; dangerSecs += secs; }
            else if (type == ZoneType.RESTRICTED) restricted++;
            else if (type == ZoneType.WARNING) warning++;
        }
        double rec = byZone.values().stream().anyMatch(c -> c > RECIDIVISM_THRESHOLD) ? RECIDIVISM_FACTOR : 1.0;
        return (danger * W_DANGER + restricted * W_RESTRICTED + warning * W_WARNING
                + sosCount * W_SOS + (dangerSecs / 60.0) * W_MINUTE_DANGER) * rec;
    }

    private RiskScoreDto.Level classifyLevel(double normalized) {
        if (normalized >= 8.0) return RiskScoreDto.Level.CRITICAL;
        if (normalized >= 6.0) return RiskScoreDto.Level.HIGH;
        if (normalized >= 3.0) return RiskScoreDto.Level.MEDIUM;
        return RiskScoreDto.Level.LOW;
    }

    private double round1(double v) { return Math.round(v * 10.0) / 10.0; }
}
