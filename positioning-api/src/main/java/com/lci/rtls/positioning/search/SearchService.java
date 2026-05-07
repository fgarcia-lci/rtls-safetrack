package com.lci.rtls.positioning.search;

import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.tag.TagSpecifications;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.worker.WorkerRepository;
import com.lci.rtls.positioning.worker.WorkerSpecifications;
import com.lci.rtls.positioning.zone.SafetyZone;
import com.lci.rtls.positioning.zone.SafetyZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Búsqueda global agrupada en operarios + tags + zonas. Para PoC usa
 * LIKE simple por nombre/code/serial — suficiente para 100s de filas.
 * Futuro: índice full-text MySQL o ElasticSearch si crece.
 */
@Service
@RequiredArgsConstructor
public class SearchService {

    private static final int MAX_PER_GROUP = 8;

    private final WorkerRepository workerRepo;
    private final TagRepository tagRepo;
    private final SafetyZoneRepository zoneRepo;

    @Transactional(readOnly = true)
    public List<SearchResultDto> search(String plantId, String query) {
        List<SearchResultDto> out = new ArrayList<>();
        if (query == null || query.trim().length() < 2) return out;

        String q = query.trim();

        // Workers — busca por nombre, employeeCode, email.
        var workers = workerRepo.findAll(
                WorkerSpecifications.withFilters(q, null, true),
                PageRequest.of(0, MAX_PER_GROUP)
        );
        for (Worker w : workers.getContent()) {
            out.add(new SearchResultDto(
                    "WORKER",
                    w.getId(),
                    w.getFullName(),
                    w.getEmployeeCode() + " · " + w.getCompanyName(),
                    w.getEmployeeCode()
            ));
        }

        // Tags — busca por serial, vendor, model, employeeCode/fullName del
        // worker asignado. Filtra por planta para evitar mezclar entornos.
        var tags = tagRepo.findAll(
                TagSpecifications.withFilters(q, plantId, null, null),
                PageRequest.of(0, MAX_PER_GROUP)
        );
        for (Tag t : tags.getContent()) {
            String sub;
            if (t.getAssignedWorker() != null) {
                sub = t.getAssignedWorker().getFullName() + " · " + t.getState();
            } else {
                sub = "Sin asignar · " + t.getState();
            }
            out.add(new SearchResultDto(
                    "TAG",
                    t.getId(),
                    t.getSerial(),
                    sub,
                    t.getSerial()
            ));
        }

        // Zonas — busca por code, name, description. Solo de la planta.
        // No usamos Specifications porque sería simple LIKE manual.
        String like = "%" + q.toLowerCase() + "%";
        var zones = zoneRepo.findByPlantIdAndDeletedAtIsNull(plantId);
        int zoneCount = 0;
        for (SafetyZone z : zones) {
            if (zoneCount >= MAX_PER_GROUP) break;
            String name = z.getName() != null ? z.getName().toLowerCase() : "";
            String code = z.getCode() != null ? z.getCode().toLowerCase() : "";
            String desc = z.getDescription() != null ? z.getDescription().toLowerCase() : "";
            if (name.contains(like.replace("%", "")) ||
                code.contains(like.replace("%", "")) ||
                desc.contains(like.replace("%", ""))) {
                out.add(new SearchResultDto(
                        "ZONE",
                        z.getId(),
                        z.getName(),
                        z.getCode() + " · " + z.getType(),
                        z.getCode()
                ));
                zoneCount++;
            }
        }

        return out;
    }
}
