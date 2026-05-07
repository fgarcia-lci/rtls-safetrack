package com.lci.rtls.positioning.realtime;

import com.lci.rtls.positioning.mqtt.model.PositionEvent;
import com.lci.rtls.positioning.realtime.dto.PositionsBatchDto;
import com.lci.rtls.positioning.realtime.dto.RealtimePositionDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Empuja batches de posiciones al WebSocket cada 250 ms.
 *
 * <p>El {@link com.lci.rtls.positioning.ingestion.PositionIngestionService} llama
 * a {@link #buffer(PositionEvent)} por cada posición ingestada válida. El batch
 * agrupa por planta y deja sólo la última posición conocida de cada tag (si
 * llegan varias del mismo tag entre dos flushes).
 *
 * <p>Frontend: suscripto a {@code /topic/positions/{plantId}} recibe un
 * {@link PositionsBatchDto} con todos los tags con cambios nuevos.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RealtimePositionPublisher {

    private static final long FLUSH_INTERVAL_MS = 250;

    private final SimpMessagingTemplate messagingTemplate;

    /** plantId -> tagId -> último evento recibido en el intervalo actual. */
    private final Map<String, Map<String, PositionEvent>> buffers = new ConcurrentHashMap<>();

    public void buffer(PositionEvent event) {
        buffers.computeIfAbsent(event.plantId(), k -> new ConcurrentHashMap<>())
                .put(event.tagId(), event);
    }

    @Scheduled(fixedRate = FLUSH_INTERVAL_MS)
    public void flush() {
        Instant now = Instant.now();
        for (var entry : buffers.entrySet()) {
            String plantId = entry.getKey();
            Map<String, PositionEvent> plantBuffer = entry.getValue();
            if (plantBuffer.isEmpty()) {
                continue;
            }

            // Snapshot + clear. Se asume aceptable perder algún evento que
            // entre justo entre la copia y el clear; el siguiente tick lo recogerá.
            Map<String, PositionEvent> snapshot = new HashMap<>(plantBuffer);
            plantBuffer.clear();

            List<RealtimePositionDto> positions = snapshot.values().stream()
                    .map(RealtimePositionDto::from)
                    .toList();

            PositionsBatchDto batch = new PositionsBatchDto(now, positions);
            String topic = "/topic/positions/" + plantId;
            messagingTemplate.convertAndSend(topic, batch);
            log.trace("Flushed batch plantId={} count={} topic={}", plantId, positions.size(), topic);
        }
    }
}
