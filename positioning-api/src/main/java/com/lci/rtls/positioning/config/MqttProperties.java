package com.lci.rtls.positioning.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * Configuración del cliente MQTT, leída del namespace `rtls.mqtt` del application.yml.
 */
@ConfigurationProperties(prefix = "rtls.mqtt")
public record MqttProperties(
        String brokerUrl,
        String clientIdPrefix,
        String username,
        String password,
        Map<String, String> topicPatterns,
        String commandTopicTemplate
) {
}
