package com.lci.rtls.positioning.mqtt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lci.rtls.positioning.config.MqttProperties;
import com.lci.rtls.positioning.mqtt.model.HapticCommand;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.mqttv5.client.MqttAsyncClient;
import org.eclipse.paho.mqttv5.common.MqttException;
import org.eclipse.paho.mqttv5.common.MqttMessage;
import org.springframework.stereotype.Service;

/**
 * Publica comandos al broker MQTT. Reutiliza el {@link MqttAsyncClient} bean
 * (el mismo que usa el subscriber) — Paho permite publish + subscribe en la
 * misma conexión.
 *
 * <p>Comandos QoS 1, no retained: el receptor (firmware del tag) los procesa
 * y los descarta; un comando antiguo retained sería peligroso.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MqttCommandPublisher {

    private static final int QOS_COMMANDS = 1;

    private final MqttAsyncClient client;
    private final MqttProperties props;
    private final ObjectMapper objectMapper;

    /** Publica un {@link HapticCommand} al tag indicado. */
    public void publishHaptic(String plantId, String tagSerial, HapticCommand command) {
        if (client == null || !client.isConnected()) {
            log.warn("MQTT no conectado — skip haptic plant={} tag={}", plantId, tagSerial);
            return;
        }
        String topic = props.commandTopicTemplate()
                .replace("{plantId}", plantId)
                .replace("{tagId}", tagSerial);
        try {
            byte[] payload = objectMapper.writeValueAsBytes(command);
            MqttMessage msg = new MqttMessage(payload);
            msg.setQos(QOS_COMMANDS);
            msg.setRetained(false);
            client.publish(topic, msg);
            log.debug("Published haptic plant={} tag={} pattern={} cmdId={}",
                    plantId, tagSerial, command.pattern(), command.cmdId());
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize HapticCommand", e);
        } catch (MqttException e) {
            log.error("Failed to publish haptic plant={} tag={}", plantId, tagSerial, e);
        }
    }
}
