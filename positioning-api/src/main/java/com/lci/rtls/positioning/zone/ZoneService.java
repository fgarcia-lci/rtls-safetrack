package com.lci.rtls.positioning.zone;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lci.rtls.positioning.zone.dto.NotificationPolicyDto;
import com.lci.rtls.positioning.zone.dto.SafetyZoneCreateDto;
import com.lci.rtls.positioning.zone.dto.SafetyZoneDto;
import com.lci.rtls.positioning.zone.dto.SafetyZoneUpdateDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Lógica de zonas: CRUD de {@link SafetyZone} junto con sus permisos
 * (roles autorizados) y su política de notificaciones (1:1).
 *
 * <p>Las operaciones de create/update son transaccionales — si falla algún
 * paso, no se persiste nada.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ZoneService {

    private final SafetyZoneRepository zoneRepo;
    private final ZonePermissionRepository permissionRepo;
    private final ZoneNotificationPolicyRepository policyRepo;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<SafetyZoneDto> listByPlant(String plantId, Boolean isActive) {
        // Siempre filtra deletedAt IS NULL — las zonas borradas (lógico)
        // no aparecen aquí, solo en una hipotética futura "papelera".
        List<SafetyZone> zones = (isActive != null && isActive)
                ? zoneRepo.findByPlantIdAndIsActiveTrueAndDeletedAtIsNull(plantId)
                : zoneRepo.findByPlantIdAndDeletedAtIsNull(plantId);
        return zones.stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public SafetyZoneDto getById(Long id) {
        return toDto(loadOrFail(id));
    }

    @Transactional
    public SafetyZoneDto create(SafetyZoneCreateDto dto) {
        if (zoneRepo.existsByPlantIdAndCode(dto.plantId(), dto.code())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ya existe una zona con code '" + dto.code() + "' para la planta " + dto.plantId());
        }
        SafetyZone z = SafetyZone.builder()
                .plantId(dto.plantId())
                .code(dto.code())
                .name(dto.name())
                .description(dto.description())
                .type(dto.type())
                .shapeType(dto.shapeType())
                .severity(dto.severity())
                .polygon2d(serializePolygon(dto.polygon2d()))
                .zMin(dto.zMin())
                .zMax(dto.zMax())
                .bufferApproachM(dto.bufferApproachM())
                .relatedDeviceId(dto.relatedDeviceId())
                .isActive(true)
                .displayColor(dto.displayColor())
                .build();
        SafetyZone saved = zoneRepo.save(z);

        savePermissions(saved.getId(), dto.allowedRoles());
        savePolicy(saved.getId(),
                dto.notificationPolicy() != null ? dto.notificationPolicy() : NotificationPolicyDto.defaults());

        log.info("Zone created id={} code={} plant={}", saved.getId(), saved.getCode(), saved.getPlantId());
        return toDto(saved);
    }

    @Transactional
    public SafetyZoneDto update(Long id, SafetyZoneUpdateDto dto) {
        SafetyZone z = loadOrFail(id);
        z.setName(dto.name());
        z.setDescription(dto.description());
        z.setType(dto.type());
        z.setShapeType(dto.shapeType());
        z.setSeverity(dto.severity());
        z.setPolygon2d(serializePolygon(dto.polygon2d()));
        z.setZMin(dto.zMin());
        z.setZMax(dto.zMax());
        z.setBufferApproachM(dto.bufferApproachM());
        z.setRelatedDeviceId(dto.relatedDeviceId());
        z.setActive(dto.isActive());
        z.setDisplayColor(dto.displayColor());
        SafetyZone saved = zoneRepo.save(z);

        // Reemplaza permisos completos (delete + insert).
        permissionRepo.deleteByIdZoneId(id);
        savePermissions(id, dto.allowedRoles());

        // Upsert policy.
        savePolicy(id,
                dto.notificationPolicy() != null ? dto.notificationPolicy() : NotificationPolicyDto.defaults());

        log.info("Zone updated id={} code={}", saved.getId(), saved.getCode());
        return toDto(saved);
    }

    /**
     * Borrado lógico — setea {@code deletedAt = now}. La zona desaparece
     * de los listados públicos y del motor de proximidad. Recuperable
     * directamente en BD por un admin (UPDATE deleted_at = NULL).
     */
    @Transactional
    public void delete(Long id) {
        SafetyZone z = loadOrFail(id);
        if (z.getDeletedAt() == null) {
            z.setDeletedAt(java.time.Instant.now());
            zoneRepo.save(z);
            log.info("Zone soft-deleted id={} code={}", z.getId(), z.getCode());
        }
    }

    /**
     * Toggle de {@code isActive} sin necesidad de pasar el payload completo
     * de actualización. La zona sigue en la lista; solo cambia si el motor
     * la evalúa o no. Idempotente.
     */
    @Transactional
    public SafetyZoneDto setActive(Long id, boolean active) {
        SafetyZone z = loadOrFail(id);
        if (z.isActive() != active) {
            z.setActive(active);
            zoneRepo.save(z);
            log.info("Zone {} id={} code={}", active ? "activated" : "deactivated",
                    z.getId(), z.getCode());
        }
        return toDto(z);
    }

    // ---- helpers privados ----

    private SafetyZone loadOrFail(Long id) {
        return zoneRepo.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Zone " + id + " no encontrada"));
    }

    private SafetyZoneDto toDto(SafetyZone z) {
        var permissions = permissionRepo.findByIdZoneId(z.getId());
        var policy = policyRepo.findById(z.getId()).orElse(null);
        return SafetyZoneDto.from(z, permissions, policy, objectMapper);
    }

    private String serializePolygon(List<List<Double>> polygon) {
        try {
            return objectMapper.writeValueAsString(polygon);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_2d inválido", e);
        }
    }

    private void savePermissions(Long zoneId, List<String> roles) {
        if (roles == null || roles.isEmpty()) return;
        for (String role : roles) {
            ZonePermission p = ZonePermission.builder()
                    .id(new ZonePermissionId(zoneId, role))
                    .build();
            permissionRepo.save(p);
        }
    }

    private void savePolicy(Long zoneId, NotificationPolicyDto dto) {
        // Save funciona como upsert en JPA (existe → merge, no existe → insert).
        policyRepo.save(dto.toEntity(zoneId));
    }
}
