package com.lci.rtls.positioning.dashboard;

import com.lci.rtls.positioning.sos.SosEventRepository;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.worker.WorkerRepository;
import com.lci.rtls.positioning.zone.ProximityEventRepository;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.SafetyZoneRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Calcula el resumen agregado del Dashboard. Cada KPI es una consulta o
 * un cálculo en memoria sobre datos ya cargados.
 *
 * <p>No es lo más eficiente para muchas plantas — para el PoC y la
 * primera fase es suficiente; con tablas grandes se cachearía con
 * @Cacheable(ttl=60s) o se materializaría con un job de fondo.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DashboardService {

    private static final Duration ACTIVE_THRESHOLD = Duration.ofMinutes(5);
    private static final int LOW_BATTERY_THRESHOLD = 20;
    private static final int TOP_N = 5;

    private final WorkerRepository workerRepo;
    private final TagRepository tagRepo;
    private final ProximityEventRepository eventRepo;
    private final SosEventRepository sosRepo;
    private final SafetyZoneRepository zoneRepo;

    public DashboardSummaryDto summary(String plantId) {
        Instant now = Instant.now();
        Instant todayStart = LocalDate.now(ZoneId.systemDefault()).atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant tomorrowStart = todayStart.plus(Duration.ofDays(1));
        Instant last24h = now.minus(Duration.ofHours(24));
        Instant last7d = now.minus(Duration.ofDays(7));

        // --- Plantilla ---
        // Filtramos isWorkerInPlant porque pos_persons también contiene
        // supervisores y managers de empresa (V13), que no cuentan como
        // "trabajadores en planta".
        List<Worker> workers = workerRepo.findAll().stream()
                .filter(Worker::isWorkerInPlant)
                .filter(Worker::isActive)
                .toList();
        int workersTotal = workers.size();

        List<Tag> tags = tagRepo.findAll().stream()
                .filter(t -> plantId.equals(t.getPlantId()))
                .toList();
        int tagsTotal = tags.size();
        int tagsAssigned = (int) tags.stream().filter(t -> t.getAssignedWorker() != null).count();
        int tagsLowBattery = (int) tags.stream()
                .filter(t -> t.getBatteryLastPct() != null && t.getBatteryLastPct() < LOW_BATTERY_THRESHOLD)
                .count();

        int workersWithTag = (int) tags.stream()
                .filter(t -> t.getAssignedWorker() != null)
                .map(t -> t.getAssignedWorker().getId())
                .distinct()
                .count();

        int workersActive = (int) tags.stream()
                .filter(t -> t.getAssignedWorker() != null)
                .filter(t -> t.getLastSeenAt() != null && t.getLastSeenAt().isAfter(now.minus(ACTIVE_THRESHOLD)))
                .map(t -> t.getAssignedWorker().getId())
                .distinct()
                .count();

        // --- Alertas (proximity) ---
        long alertsToday = eventRepo.countByPlantAndDateRange(plantId, todayStart, tomorrowStart);
        long alertsLast24h = eventRepo.countByPlantAndDateRange(plantId, last24h, now);
        long alertsLast7d = eventRepo.countByPlantAndDateRange(plantId, last7d, now);
        Double mttr = eventRepo.avgMttrSecondsByPlant(plantId, todayStart);

        // --- SOS ---
        long sosActive = sosRepo.findActiveByPlant(plantId).size();
        long sosToday = sosRepo.findAllByPlant(plantId).stream()
                .filter(s -> s.getTriggeredAt().isAfter(todayStart))
                .count();

        // --- Top zonas ---
        Map<Long, SafetyZone> zoneById = new HashMap<>();
        for (SafetyZone z : zoneRepo.findByPlantIdAndDeletedAtIsNull(plantId)) zoneById.put(z.getId(), z);
        List<DashboardSummaryDto.ZoneRanking> topZones = eventRepo
                .topZonesByEvents(plantId, todayStart).stream()
                .limit(TOP_N)
                .map(row -> {
                    Long zid = (Long) row[0];
                    long count = ((Number) row[1]).longValue();
                    SafetyZone z = zoneById.get(zid);
                    return new DashboardSummaryDto.ZoneRanking(
                            zid,
                            z != null ? z.getCode() : "?",
                            z != null ? z.getName() : "(zona eliminada)",
                            z != null ? z.getType().name() : "?",
                            count);
                }).toList();

        // --- Top workers (peligrosidad) ---
        Map<Long, Worker> workerById = new HashMap<>();
        for (Worker w : workers) workerById.put(w.getId(), w);
        List<DashboardSummaryDto.WorkerRanking> topWorkers = eventRepo
                .topWorkersByEvents(plantId, todayStart).stream()
                .limit(TOP_N)
                .map(row -> {
                    Long wid = (Long) row[0];
                    long count = ((Number) row[1]).longValue();
                    Worker w = workerById.get(wid);
                    return new DashboardSummaryDto.WorkerRanking(
                            wid,
                            w != null ? w.getEmployeeCode() : "?",
                            w != null ? w.getFullName() : "(operario eliminado)",
                            w != null ? w.getCompanyName() : null,
                            w != null ? w.getCompanyType() : null,
                            w != null ? w.getPhotoUrl() : null,
                            count);
                }).toList();

        // --- Empresas presentes (workers activos agrupados por empresa) ---
        // Agrupa por nombre de empresa (string libre) y, si todos los workers
        // de ese grupo apuntan al mismo company del catálogo, expone su id
        // para que el dashboard pueda enlazar a /companies/:id.
        Map<String, int[]> companyCounts = new HashMap<>();
        Map<String, com.lci.rtls.positioning.worker.CompanyType> companyTypeByName = new HashMap<>();
        Map<String, Long> companyIdByName = new HashMap<>();
        Set<String> ambiguousCompanyIds = new HashSet<>();
        for (Tag t : tags) {
            if (t.getAssignedWorker() == null) continue;
            if (t.getLastSeenAt() == null || t.getLastSeenAt().isBefore(now.minus(ACTIVE_THRESHOLD))) continue;
            Worker w = t.getAssignedWorker();
            String c = w.getCompanyName();
            if (c == null) continue;
            companyCounts.computeIfAbsent(c, k -> new int[]{0})[0]++;
            companyTypeByName.putIfAbsent(c, w.getCompanyType());
            Long catalogId = w.getCompany() != null ? w.getCompany().getId() : null;
            if (catalogId != null) {
                Long existing = companyIdByName.get(c);
                if (existing == null) {
                    companyIdByName.put(c, catalogId);
                } else if (!existing.equals(catalogId)) {
                    // Mismo nombre pero distinto id en el catálogo — no enlazable.
                    ambiguousCompanyIds.add(c);
                }
            }
        }
        List<DashboardSummaryDto.CompanyPresence> companies = companyCounts.entrySet().stream()
                .map(e -> new DashboardSummaryDto.CompanyPresence(
                        ambiguousCompanyIds.contains(e.getKey()) ? null : companyIdByName.get(e.getKey()),
                        e.getKey(),
                        companyTypeByName.get(e.getKey()),
                        e.getValue()[0]))
                .sorted((a, b) -> Integer.compare(b.workersActive(), a.workersActive()))
                .toList();

        return new DashboardSummaryDto(
                plantId,
                now,
                workersTotal,
                workersActive,
                workersWithTag,
                tagsTotal,
                tagsAssigned,
                tagsLowBattery,
                alertsToday,
                alertsLast24h,
                alertsLast7d,
                mttr,
                sosActive,
                sosToday,
                topZones,
                topWorkers,
                companies
        );
    }
}
