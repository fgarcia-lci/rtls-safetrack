package com.lci.rtls.positioning.mqtt.adapter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lci.rtls.positioning.mqtt.model.Position3D;
import com.lci.rtls.positioning.mqtt.model.PositionEvent;
import com.lci.rtls.positioning.mqtt.model.TagStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Adapter para el formato del simulador (`sim/v1/...`). Ver docs/03_MQTT_FORMAT.md.
 *
 * <p>Cuando llegue el HW real, su formato lo parseará un nuevo {@code <Vendor>Adapter}
 * y este {@code SimulatorAdapter} seguirá funcionando solo para los mensajes que
 * publique el simulador (en tests y demos).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SimulatorAdapter implements PositionEventAdapter {

    private static final Pattern POSITION_TOPIC = Pattern.compile("^sim/v1/plant/[^/]+/tag/[^/]+/position$");
    private static final Pattern STATUS_TOPIC = Pattern.compile("^sim/v1/plant/[^/]+/tag/[^/]+/status$");
    private static final Pattern HEARTBEAT_TOPIC = Pattern.compile("^sim/v1/plant/[^/]+/system/heartbeat$");

    private final ObjectMapper objectMapper;

    @Override
    public boolean supports(String topic) {
        return POSITION_TOPIC.matcher(topic).matches()
                || STATUS_TOPIC.matcher(topic).matches()
                || HEARTBEAT_TOPIC.matcher(topic).matches();
    }

    @Override
    public Optional<PositionEvent> parsePosition(String topic, byte[] payload) {
        if (!POSITION_TOPIC.matcher(topic).matches()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(payload);
            JsonNode pos = root.get("pos");
            if (pos == null || !pos.has("x") || !pos.has("y") || !pos.has("z")) {
                log.warn("Position payload missing pos.x/y/z on topic={}", topic);
                return Optional.empty();
            }
            return Optional.of(new PositionEvent(
                    requiredText(root, "tag_id"),
                    requiredText(root, "plant_id"),
                    Instant.parse(requiredText(root, "ts")),
                    new Position3D(pos.get("x").asDouble(), pos.get("y").asDouble(), pos.get("z").asDouble()),
                    root.has("accuracy_m") ? root.get("accuracy_m").asDouble() : null,
                    parseQuality(root.path("quality").asText("GOOD")),
                    parseSource(root.path("source").asText("simulated")),
                    root.has("seq") ? root.get("seq").asLong() : null,
                    Map.of()
            ));
        } catch (Exception e) {
            log.warn("Failed to parse simulator position on topic={}: {}", topic, e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public Optional<TagStatus> parseStatus(String topic, byte[] payload) {
        if (!STATUS_TOPIC.matcher(topic).matches()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(payload);
            return Optional.of(new TagStatus(
                    requiredText(root, "tag_id"),
                    requiredText(root, "plant_id"),
                    Instant.parse(requiredText(root, "ts")),
                    root.has("battery_pct") ? root.get("battery_pct").asInt() : null,
                    root.has("rssi_dbm") ? root.get("rssi_dbm").asInt() : null,
                    root.path("firmware").asText(null),
                    parseState(root.path("state").asText("UNKNOWN"))
            ));
        } catch (Exception e) {
            log.warn("Failed to parse simulator status on topic={}: {}", topic, e.getMessage());
            return Optional.empty();
        }
    }

    private static String requiredText(JsonNode root, String field) {
        JsonNode node = root.get(field);
        if (node == null || node.isNull() || node.asText().isBlank()) {
            throw new IllegalArgumentException("Missing required field: " + field);
        }
        return node.asText();
    }

    private static PositionEvent.Quality parseQuality(String s) {
        try {
            return PositionEvent.Quality.valueOf(s.toUpperCase());
        } catch (Exception e) {
            return PositionEvent.Quality.GOOD;
        }
    }

    private static PositionEvent.Source parseSource(String s) {
        try {
            return PositionEvent.Source.valueOf(s.toUpperCase());
        } catch (Exception e) {
            return PositionEvent.Source.SIMULATED;
        }
    }

    private static TagStatus.State parseState(String s) {
        try {
            return TagStatus.State.valueOf(s.toUpperCase());
        } catch (Exception e) {
            return TagStatus.State.UNKNOWN;
        }
    }
}
