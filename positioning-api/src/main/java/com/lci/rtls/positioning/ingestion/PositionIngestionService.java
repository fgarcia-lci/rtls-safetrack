package com.lci.rtls.positioning.ingestion;

import com.lci.rtls.positioning.ingestion.document.TagPositionCurrent;
import com.lci.rtls.positioning.ingestion.document.TagPositionHistory;
import com.lci.rtls.positioning.ingestion.repository.TagPositionCurrentRepository;
import com.lci.rtls.positioning.ingestion.repository.TagPositionHistoryRepository;
import com.lci.rtls.positioning.mqtt.model.PositionEvent;
import com.lci.rtls.positioning.mqtt.model.TagStatus;
import com.lci.rtls.positioning.realtime.RealtimePositionPublisher;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.tag.TagState;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Persiste eventos de posición y status del flujo MQTT.
 *
 * <p>Position:
 * <ul>
 *   <li>{@code tag_positions_current} (Mongo): upsert.</li>
 *   <li>{@code tag_positions_history} (Mongo): insert (TTL 48h).</li>
 *   <li>{@code pos_tags.last_seen_at} (MySQL): touch.</li>
 * </ul>
 *
 * <p>Status:
 * <ul>
 *   <li>{@code pos_tags.battery_last_pct/state/last_seen_at} (MySQL): update.</li>
 * </ul>
 *
 * <p>Si llega un mensaje de un serial desconocido en {@code pos_tags},
 * se auto-crea con {@code state=UNKNOWN} y el {@code plantId} del propio mensaje.
 * El admin completa después modelo, vendor, asignación a worker.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PositionIngestionService {

    private static final Duration MAX_TS_PAST_DRIFT = Duration.ofSeconds(30);
    private static final Duration MAX_TS_FUTURE_DRIFT = Duration.ofSeconds(5);

    private final TagPositionCurrentRepository currentRepo;
    private final TagPositionHistoryRepository historyRepo;
    private final TagRepository tagRepo;
    private final RealtimePositionPublisher realtimePublisher;

    public void ingestPosition(PositionEvent event) {
        if (!isValid(event)) {
            return;
        }

        Instant now = Instant.now();

        TagPositionCurrent current = TagPositionCurrent.builder()
                .tagId(event.tagId())
                .plantId(event.plantId())
                .ts(event.ts())
                .x(event.position().x())
                .y(event.position().y())
                .z(event.position().z())
                .accuracyM(event.accuracyM())
                .quality(event.quality())
                .source(event.source())
                .seq(event.seq())
                .updatedAt(now)
                .build();
        currentRepo.save(current);

        TagPositionHistory history = TagPositionHistory.builder()
                .tagId(event.tagId())
                .plantId(event.plantId())
                .ts(event.ts())
                .x(event.position().x())
                .y(event.position().y())
                .z(event.position().z())
                .accuracyM(event.accuracyM())
                .quality(event.quality())
                .build();
        historyRepo.save(history);

        touchTag(event.tagId(), event.plantId(), now);

        realtimePublisher.buffer(event);

        log.debug("Ingested position tag={} plant={} pos=({},{},{}) seq={}",
                event.tagId(), event.plantId(),
                event.position().x(), event.position().y(), event.position().z(),
                event.seq());
    }

    public void ingestStatus(TagStatus status) {
        updateTagFromStatus(status);
        log.debug("Status ingested tag={} battery={} state={}",
                status.tagId(), status.batteryPct(), status.state());
    }

    /**
     * Actualiza {@code last_seen_at} del tag en MySQL. Auto-crea si no existe.
     */
    @Transactional
    protected void touchTag(String serial, String plantId, Instant now) {
        Tag tag = tagRepo.findBySerial(serial).orElseGet(() -> {
            log.info("Auto-creating tag from MQTT flow: serial={} plantId={}", serial, plantId);
            return tagRepo.save(Tag.builder()
                    .serial(serial)
                    .plantId(plantId)
                    .state(TagState.UNKNOWN)
                    .build());
        });
        tag.setLastSeenAt(now);
        tagRepo.save(tag);
    }

    /**
     * Aplica un mensaje de status al tag en MySQL: actualiza batería, estado y last_seen_at.
     * Auto-crea si no existe.
     */
    @Transactional
    protected void updateTagFromStatus(TagStatus status) {
        Tag tag = tagRepo.findBySerial(status.tagId()).orElseGet(() -> {
            log.info("Auto-creating tag from status: serial={} plantId={}", status.tagId(), status.plantId());
            return tagRepo.save(Tag.builder()
                    .serial(status.tagId())
                    .plantId(status.plantId())
                    .state(TagState.UNKNOWN)
                    .build());
        });
        if (status.batteryPct() != null) {
            tag.setBatteryLastPct(status.batteryPct());
        }
        if (status.state() != null) {
            // Mapear el enum del modelo MQTT al enum JPA
            tag.setState(TagState.valueOf(status.state().name()));
        }
        tag.setLastSeenAt(status.ts() != null ? status.ts() : Instant.now());
        tagRepo.save(tag);
    }

    private boolean isValid(PositionEvent event) {
        if (event.quality() == PositionEvent.Quality.BAD) {
            log.debug("Discarding BAD position: tag={}", event.tagId());
            return false;
        }
        Instant now = Instant.now();
        if (event.ts().isBefore(now.minus(MAX_TS_PAST_DRIFT))) {
            log.warn("Discarding stale position: tag={} ts={} (drift > {}s)",
                    event.tagId(), event.ts(), MAX_TS_PAST_DRIFT.toSeconds());
            return false;
        }
        if (event.ts().isAfter(now.plus(MAX_TS_FUTURE_DRIFT))) {
            log.warn("Discarding future-dated position: tag={} ts={}",
                    event.tagId(), event.ts());
            return false;
        }
        return true;
    }
}
