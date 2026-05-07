package com.lci.rtls.positioning.zone;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lci.rtls.positioning.ingestion.document.TagPositionCurrent;
import com.lci.rtls.positioning.ingestion.repository.TagPositionCurrentRepository;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.zone.dto.ProximityBatchDto;
import com.lci.rtls.positioning.zone.dto.ProximityFactorDto;
import com.lci.rtls.positioning.zone.dto.ProximityFactorDto.ProximityState;
import com.lci.rtls.positioning.zone.geometry.PolygonMath;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Motor de proximidad. Tick cada 500 ms:
 *
 * <ol>
 *   <li>Lee zonas activas agrupadas por planta (con caché en memoria
 *       refrescada cada {@code ZONE_CACHE_REFRESH_MS}).</li>
 *   <li>Lee posiciones actuales de los tags por planta.</li>
 *   <li>Para cada par (tag, zona), calcula {@code proximityFactor ∈ [0..1]}.</li>
 *   <li>Mantiene state machine en memoria: detecta entradas/salidas y crea/
 *       cierra {@link ProximityEvent} en BD.</li>
 *   <li>Publica el factor por WebSocket {@code /topic/proximity/{plantId}}
 *       (solo pares con {@code factor > 0}, para no saturar).</li>
 * </ol>
 *
 * <p>Convención de coordenadas: tag y polígono ambos en coords mundiales del
 * modelo (top-down XY). z = altura. Polígono evaluado en (x, y); altura
 * comprobada contra {@code zMin/zMax}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ZoneEngineService {

    private static final long TICK_INTERVAL_MS = 500;
    private static final long ZONE_CACHE_REFRESH_MS = 5_000;

    private final SafetyZoneRepository zoneRepo;
    private final TagPositionCurrentRepository positionRepo;
    private final ProximityEventRepository eventRepo;
    private final TagRepository tagRepo;
    private final ProximityNotificationDispatcher dispatcher;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    /** plantId → zonas activas (refrescadas periódicamente). */
    private final Map<String, List<ZoneCached>> zonesCache = new ConcurrentHashMap<>();
    private volatile long zonesCacheTs = 0;

    /** (tagId, zoneId) → ¿estaba dentro en el tick anterior? */
    private final Map<Pair, Boolean> insideState = new ConcurrentHashMap<>();

    @PostConstruct
    void init() {
        log.info("ZoneEngineService iniciado, tick={}ms cacheRefresh={}ms",
                TICK_INTERVAL_MS, ZONE_CACHE_REFRESH_MS);
    }

    @Scheduled(fixedDelay = TICK_INTERVAL_MS)
    public void tick() {
        try {
            refreshZonesCacheIfNeeded();
            for (var entry : zonesCache.entrySet()) {
                String plantId = entry.getKey();
                List<ZoneCached> zones = entry.getValue();
                if (zones.isEmpty()) continue;
                evaluatePlant(plantId, zones);
            }
        } catch (Exception ex) {
            // Nunca dejar que el scheduler muera — solo loguear.
            log.error("ZoneEngine tick error", ex);
        }
    }

    private void evaluatePlant(String plantId, List<ZoneCached> zones) {
        List<TagPositionCurrent> positions = positionRepo.findByPlantId(plantId);
        if (positions.isEmpty()) return;

        Instant now = Instant.now();
        List<ProximityFactorDto> factors = new ArrayList<>();

        for (TagPositionCurrent pos : positions) {
            for (ZoneCached zone : zones) {
                double factor = computeFactor(pos, zone);
                ProximityState state;
                if (factor >= 1.0) state = ProximityState.INSIDE;
                else if (factor > 0.0) state = ProximityState.APPROACHING;
                else state = ProximityState.OUTSIDE;

                if (factor > 0.0) {
                    factors.add(new ProximityFactorDto(pos.getTagId(), zone.id(), factor, state));
                }

                handleStateMachine(pos, zone, state, now);
            }
        }

        if (!factors.isEmpty()) {
            String topic = "/topic/proximity/" + plantId;
            messagingTemplate.convertAndSend(topic, new ProximityBatchDto(now, factors));
        }
    }

    /** Calcula factor ∈ [0..1] para un par (tag, zona). */
    private double computeFactor(TagPositionCurrent pos, ZoneCached zone) {
        // Altura: convención RTLS interna z = altura (m).
        if (pos.getZ() < zone.zMin() || pos.getZ() > zone.zMax()) {
            return 0.0;
        }
        boolean inside = PolygonMath.pointInPolygon(pos.getX(), pos.getY(), zone.polygon());
        if (inside) return 1.0;
        if (zone.bufferApproachM() <= 0) return 0.0;
        double dist = PolygonMath.distanceToPolygonBoundary(pos.getX(), pos.getY(), zone.polygon());
        if (dist >= zone.bufferApproachM()) return 0.0;
        // Lineal: dist=0 (en el borde) → factor=1, dist=buffer → factor=0.
        double f = 1.0 - (dist / zone.bufferApproachM());
        return Math.max(0.0, Math.min(1.0, f));
    }

    private void handleStateMachine(TagPositionCurrent pos, ZoneCached zone,
                                    ProximityState state, Instant now) {
        Pair key = new Pair(pos.getTagId(), zone.id());
        boolean wasInside = insideState.getOrDefault(key, false);
        boolean isInside = state == ProximityState.INSIDE;

        if (isInside && !wasInside) {
            openEvent(pos, zone, now);
            insideState.put(key, true);
        } else if (!isInside && wasInside) {
            closeEvent(pos, zone, now);
            insideState.put(key, false);
        }
        // Si pasa de INSIDE a APPROACHING/OUTSIDE, isInside=false, wasInside=true → cierra.
        // Si sigue INSIDE o sigue OUTSIDE, no hay transición.
    }

    private void openEvent(TagPositionCurrent pos, ZoneCached zone, Instant now) {
        try {
            // Resolver tag/worker. tagId del simulador = serial del Tag.
            Tag tag = tagRepo.findBySerial(pos.getTagId()).orElse(null);
            Long tagDbId = tag != null ? tag.getId() : null;
            Long workerId = (tag != null && tag.getAssignedWorker() != null)
                    ? tag.getAssignedWorker().getId() : null;

            if (tagDbId == null) {
                log.debug("Tag '{}' no existe en BD — no se crea ProximityEvent.", pos.getTagId());
                return;
            }

            ProximityEvent event = ProximityEvent.builder()
                    .tagId(tagDbId)
                    .workerId(workerId)
                    .zoneId(zone.id())
                    .plantId(zone.plantId())
                    .enteredAt(now)
                    .entryPoint(serializePoint(pos))
                    .maxSeverity(zone.severity())
                    .build();
            ProximityEvent saved = eventRepo.save(event);
            dispatcher.onEnter(saved, zone.toEntity());
            log.info("Zone ENTRY tag={} zone={} eventId={}", pos.getTagId(), zone.code(), saved.getId());
        } catch (Exception ex) {
            log.error("Failed to open ProximityEvent tag={} zone={}", pos.getTagId(), zone.code(), ex);
        }
    }

    private void closeEvent(TagPositionCurrent pos, ZoneCached zone, Instant now) {
        try {
            Tag tag = tagRepo.findBySerial(pos.getTagId()).orElse(null);
            if (tag == null) return;
            eventRepo.findFirstByTagIdAndZoneIdAndExitedAtIsNull(tag.getId(), zone.id())
                    .ifPresent(event -> {
                        event.setExitedAt(now);
                        event.setExitPoint(serializePoint(pos));
                        ProximityEvent saved = eventRepo.save(event);
                        dispatcher.onExit(saved, zone.toEntity());
                        log.info("Zone EXIT tag={} zone={} eventId={}",
                                pos.getTagId(), zone.code(), saved.getId());
                    });
        } catch (Exception ex) {
            log.error("Failed to close ProximityEvent tag={} zone={}", pos.getTagId(), zone.code(), ex);
        }
    }

    private String serializePoint(TagPositionCurrent pos) {
        try {
            return objectMapper.writeValueAsString(Map.of("x", pos.getX(), "y", pos.getY(), "z", pos.getZ()));
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /**
     * Refresca caché de zonas si han pasado {@code ZONE_CACHE_REFRESH_MS}
     * desde la última carga. Permite que cambios en zonas se reflejen sin
     * reiniciar el servicio.
     */
    private void refreshZonesCacheIfNeeded() {
        long now = System.currentTimeMillis();
        if (now - zonesCacheTs < ZONE_CACHE_REFRESH_MS && !zonesCache.isEmpty()) return;

        Map<String, List<ZoneCached>> next = new HashMap<>();
        // Solo zonas vivas (no borradas) y activas — las desactivadas o
        // borradas no se evalúan para no disparar alertas accidentales.
        for (SafetyZone zone : zoneRepo.findByIsActiveTrueAndDeletedAtIsNull()) {
            try {
                List<List<Double>> polygon = objectMapper.readValue(
                        zone.getPolygon2d(), new TypeReference<List<List<Double>>>() {});
                ZoneCached cached = new ZoneCached(
                        zone.getId(),
                        zone.getPlantId(),
                        zone.getCode(),
                        zone.getName(),
                        zone.getType(),
                        zone.getSeverity(),
                        polygon,
                        zone.getZMin().doubleValue(),
                        zone.getZMax().doubleValue(),
                        zone.getBufferApproachM() != null ? zone.getBufferApproachM().doubleValue() : 0.0,
                        zone.getDisplayColor(),
                        zone
                );
                next.computeIfAbsent(zone.getPlantId(), k -> new ArrayList<>()).add(cached);
            } catch (Exception ex) {
                log.error("Skipping zone {} — bad polygon JSON: {}", zone.getCode(), ex.getMessage());
            }
        }

        zonesCache.clear();
        zonesCache.putAll(next);
        zonesCacheTs = now;
        // Limpia state machine de zonas que ya no existen / están inactivas.
        Set<Long> activeZoneIds = next.values().stream()
                .flatMap(List::stream)
                .map(ZoneCached::id)
                .collect(java.util.stream.Collectors.toSet());
        insideState.keySet().removeIf(p -> !activeZoneIds.contains(p.zoneId()));

        log.debug("Zones cache refreshed: {} plants, {} zones",
                zonesCache.size(),
                zonesCache.values().stream().mapToInt(List::size).sum());
    }

    /** Snapshot inmutable de una zona, optimizado para el tick (evita fetch JPA). */
    private record ZoneCached(
            Long id,
            String plantId,
            String code,
            String name,
            ZoneType type,
            Integer severity,
            List<List<Double>> polygon,
            double zMin,
            double zMax,
            double bufferApproachM,
            String displayColor,
            SafetyZone source
    ) {
        SafetyZone toEntity() { return source; }
    }

    private record Pair(String tagId, Long zoneId) {}
}
