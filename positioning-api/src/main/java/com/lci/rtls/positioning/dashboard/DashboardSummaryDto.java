package com.lci.rtls.positioning.dashboard;

import com.lci.rtls.positioning.worker.CompanyType;

import java.time.Instant;
import java.util.List;

/**
 * Snapshot agregado de la planta para el Dashboard de KPIs.
 * Calculado bajo demanda en {@link DashboardService}.
 */
public record DashboardSummaryDto(
        String plantId,
        Instant generatedAt,

        // Plantilla
        int workersTotal,
        int workersActive,         // con tag asignado activo (lastSeen < 5 min)
        int workersWithTag,        // con tag asignado (independientemente de actividad)

        // Tags
        int tagsTotal,
        int tagsAssigned,
        int tagsLowBattery,        // batería < 20%

        // Alertas (proximity)
        long alertsToday,
        long alertsLast24h,
        long alertsLast7d,
        Double avgMttrSecondsToday, // null si no hay datos

        // SOS
        long sosActive,
        long sosToday,

        // Rankings
        List<ZoneRanking> topZonesToday,
        List<WorkerRanking> topWorkersToday,
        List<CompanyPresence> companiesPresent
) {
    public record ZoneRanking(Long zoneId, String code, String name, String type, long eventCount) {}
    public record WorkerRanking(Long workerId, String employeeCode, String fullName,
                                String companyName, CompanyType companyType,
                                String photoUrl, long eventCount) {}
    /** companyId puede ser null para empresas que solo viven como string libre
     *  en pos_persons (legado). Solo las que están en el catálogo se pueden
     *  abrir desde el dashboard como ficha. */
    public record CompanyPresence(Long companyId, String companyName,
                                  CompanyType companyType, int workersActive) {}
}
