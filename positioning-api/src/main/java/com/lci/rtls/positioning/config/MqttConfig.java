package com.lci.rtls.positioning.config;

import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.mqttv5.client.MqttAsyncClient;
import org.eclipse.paho.mqttv5.client.persist.MemoryPersistence;
import org.eclipse.paho.mqttv5.common.MqttException;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.UUID;

/**
 * Bean del cliente MQTT (Eclipse Paho v5). Crea el cliente sin conectar todavía;
 * la conexión la inicia el {@code MqttSubscriberService} en {@code @PostConstruct}
 * para poder controlar errores de arranque sin romper el contexto Spring.
 */
@Configuration
@EnableConfigurationProperties(MqttProperties.class)
@Slf4j
public class MqttConfig {

    @Bean(destroyMethod = "close")
    public MqttAsyncClient mqttAsyncClient(MqttProperties props) throws MqttException {
        String clientId = props.clientIdPrefix() + "-" + UUID.randomUUID().toString().substring(0, 8);
        log.info("Creating MQTT client id={} for broker={}", clientId, props.brokerUrl());
        return new MqttAsyncClient(props.brokerUrl(), clientId, new MemoryPersistence());
    }
}
