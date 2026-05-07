package com.lci.rtls.positioning.config;

import com.lci.rtls.positioning.config.websocket.JwtHandshakeInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP over WebSocket — patrón clonado del DT.
 *
 * Endpoints:
 *  - /ws       : SockJS fallback
 *  - /ws       : WebSocket puro (sin SockJS)
 *
 * Topics expuestos:
 *  - /topic/positions/{plantId} : batch de posiciones cada 200-300 ms
 *  - /topic/alerts/{plantId}    : alertas de proximidad
 *  - /user/queue/notifications  : notificaciones por usuario (futuro)
 *
 * Autenticación: JwtHandshakeInterceptor valida el JWT en el handshake,
 * sea por header Authorization o por query ?token=.
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtHandshakeInterceptor jwtHandshakeInterceptor;

    @Value("${app.websocket.allowed-origins:http://localhost:*}")
    private String allowedOrigins;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/queue", "/topic");
        config.setApplicationDestinationPrefixes("/app");
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOrigins.split(","))
                .addInterceptors(jwtHandshakeInterceptor)
                .withSockJS();

        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOrigins.split(","))
                .addInterceptors(jwtHandshakeInterceptor);
    }
}
