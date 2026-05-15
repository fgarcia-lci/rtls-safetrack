package com.lci.rtls.positioning.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lci.rtls.positioning.config.MqttProperties;
import com.lci.rtls.positioning.ingestion.PositionIngestionService;
import com.lci.rtls.positioning.mqtt.adapter.PositionEventAdapter;
import com.lci.rtls.positioning.sos.SosService;
import com.lci.rtls.positioning.sos.dto.SosMqttPayload;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.mqttv5.client.IMqttToken;
import org.eclipse.paho.mqttv5.client.MqttAsyncClient;
import org.eclipse.paho.mqttv5.client.MqttCallback;
import org.eclipse.paho.mqttv5.client.MqttConnectionOptions;
import org.eclipse.paho.mqttv5.client.MqttDisconnectResponse;
import org.eclipse.paho.mqttv5.common.MqttException;
import org.eclipse.paho.mqttv5.common.MqttMessage;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Suscriptor MQTT del positioning-api.
 *
 * <p>En {@code @PostConstruct} conecta al broker, se suscribe a todos los topics
 * declarados en {@code rtls.mqtt.topic-patterns} y delega cada mensaje al primer
 * {@link PositionEventAdapter} cuyo {@code supports()} devuelve true.
 *
 * <p>Si la conexión inicial falla (broker no disponible), el api arranca igual y
 * la conexión se intenta de nuevo automáticamente vía Paho's automatic reconnect.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MqttSubscriberService implements MqttCallback {

    private final MqttAsyncClient client;
    private final MqttProperties props;
    private final List<PositionEventAdapter> adapters;
    private final PositionIngestionService ingestionService;
    private final SosService sosService;
    private final ObjectMapper objectMapper;

    @PostConstruct
    void connect() {
        try {
            MqttConnectionOptions opts = new MqttConnectionOptions();
            opts.setAutomaticReconnect(true);
            opts.setCleanStart(true);
            opts.setKeepAliveInterval(60);
            opts.setConnectionTimeout(10);
            if (StringUtils.hasText(props.username())) {
                opts.setUserName(props.username());
                opts.setPassword((props.password() == null ? "" : props.password()).getBytes(StandardCharsets.UTF_8));
            }
            client.setCallback(this);
            log.info("Connecting to MQTT broker {} ...", props.brokerUrl());
            IMqttToken token = client.connect(opts);
            token.waitForCompletion(15000);

            for (var entry : props.topicPatterns().entrySet()) {
                String pattern = entry.getValue();
                client.subscribe(pattern, 0).waitForCompletion(5000);
                log.info("Subscribed to {} (alias={})", pattern, entry.getKey());
            }
        } catch (MqttException e) {
            log.error("Initial MQTT connection/subscription failed: {}. " +
                    "El api seguirá arrancando; Paho intentará reconectar en background.", e.getMessage());
        }
    }

    @PreDestroy
    void disconnect() {
        try {
            if (client.isConnected()) {
                client.disconnect().waitForCompletion(3000);
            }
            client.close();
        } catch (Exception e) {
            log.warn("Error closing MQTT client: {}", e.getMessage());
        }
    }

    // ---- MqttCallback ----

    @Override
    public void messageArrived(String topic, MqttMessage message) {
        byte[] payload = message.getPayload();
        // El SOS no necesita adapter — su payload es uniforme y la prioridad
        // es procesarlo lo antes posible. Extracción rápida del tag serial
        // desde el topic: .../tag/{serial}/sos
        if (topic.endsWith("/sos")) {
            handleSos(topic, payload);
            return;
        }
        for (PositionEventAdapter adapter : adapters) {
            if (!adapter.supports(topic)) {
                continue;
            }
            if (topic.endsWith("/position")) {
                adapter.parsePosition(topic, payload).ifPresent(ingestionService::ingestPosition);
            } else if (topic.endsWith("/status")) {
                adapter.parseStatus(topic, payload).ifPresent(ingestionService::ingestStatus);
            } else {
                // heartbeat u otros mensajes informativos: log y descarta.
                log.debug("Mensaje no-position/status recibido en topic={}, len={}", topic, payload.length);
            }
            return;
        }
        log.debug("No hay adapter para topic={}", topic);
    }

    /**
     * Extrae el tag serial del topic SOS y delega al servicio.
     * Topic esperado: {@code sim/v1/plant/{plant}/tag/{serial}/sos}.
     */
    private void handleSos(String topic, byte[] payload) {
        String tagSerial = extractTagSerial(topic);
        if (tagSerial == null) {
            log.warn("No se pudo extraer tagSerial del topic SOS: {}", topic);
            return;
        }
        try {
            SosMqttPayload parsed = objectMapper.readValue(payload, SosMqttPayload.class);
            sosService.onSosFromMqtt(tagSerial, parsed);
        } catch (Exception e) {
            log.error("Error procesando SOS topic={}: {}", topic, e.getMessage(), e);
        }
    }

    /**
     * Extrae el segmento entre {@code /tag/} y {@code /} del topic.
     * Acepta cualquier prefijo y sufijo después del serial.
     */
    private static String extractTagSerial(String topic) {
        int tagIdx = topic.indexOf("/tag/");
        if (tagIdx < 0) return null;
        int start = tagIdx + "/tag/".length();
        int end = topic.indexOf('/', start);
        return end > start ? topic.substring(start, end) : null;
    }

    @Override public void disconnected(MqttDisconnectResponse disconnectResponse) {
        log.warn("MQTT disconnected: {}", disconnectResponse.getReasonString());
    }

    @Override public void mqttErrorOccurred(MqttException exception) {
        log.warn("MQTT error: {}", exception.getMessage());
    }

    @Override public void deliveryComplete(IMqttToken token) { /* no-op (no publicamos aquí) */ }

    @Override public void connectComplete(boolean reconnect, String serverURI) {
        log.info("MQTT connectComplete reconnect={} serverURI={}", reconnect, serverURI);
        if (reconnect) {
            // Tras reconexión hay que re-suscribirse (cleanStart=true)
            try {
                for (var entry : props.topicPatterns().entrySet()) {
                    client.subscribe(entry.getValue(), 0);
                }
                log.info("Re-suscrito tras reconexión.");
            } catch (MqttException e) {
                log.warn("Error re-suscribiéndose tras reconexión: {}", e.getMessage());
            }
        }
    }

    @Override public void authPacketArrived(int reasonCode, org.eclipse.paho.mqttv5.common.packet.MqttProperties properties) {
        // no-op
    }
}
