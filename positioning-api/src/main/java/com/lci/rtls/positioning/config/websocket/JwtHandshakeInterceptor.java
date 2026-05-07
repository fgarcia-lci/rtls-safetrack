package com.lci.rtls.positioning.config.websocket;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;
import java.util.Optional;

/**
 * Valida el JWT en el handshake del WebSocket (header Authorization o ?token=)
 * y guarda en los attributes una Authentication con las authorities del JWT
 * para que el Principal de la sesión WS lleve usuario y permisos.
 *
 * Diferencia con el DT: aquí NO resolvemos user_id → UUID contra una tabla
 * users (no existe en RTLS Safetrack). El Principal queda como el user_id
 * o subject del JWT directamente. Para integración futura al DT esa
 * resolución la hace el JwtHandshakeInterceptor del DT.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtDecoder jwtDecoder;
    private final JwtAuthenticationConverter jwtAuthenticationConverter;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request,
                                   ServerHttpResponse response,
                                   WebSocketHandler wsHandler,
                                   Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return true;
        }
        HttpServletRequest http = servletRequest.getServletRequest();
        String token = resolveToken(http);
        if (token == null) {
            log.warn("WebSocket handshake rejected: missing JWT token");
            return false;
        }
        try {
            Jwt jwt = jwtDecoder.decode(token);
            Authentication auth = buildAuthentication(jwt, token);
            attributes.put("principal", auth);
            log.debug("WebSocket handshake authenticated for principal {}", auth.getName());
            return true;
        } catch (Exception e) {
            log.warn("WebSocket handshake rejected: invalid JWT - {}", e.getMessage());
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request,
                               ServerHttpResponse response,
                               WebSocketHandler wsHandler,
                               Exception exception) {
        // no-op
    }

    private String resolveToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return Optional.ofNullable(request.getParameter("token"))
                .filter(s -> !s.isBlank())
                .orElse(null);
    }

    private Authentication buildAuthentication(Jwt jwt, String token) {
        String userId = Optional.ofNullable(jwt.getClaimAsString("user_id"))
                .filter(s -> !s.isBlank())
                .orElse(jwt.getSubject());

        var converted = jwtAuthenticationConverter.convert(jwt);
        return new UsernamePasswordAuthenticationToken(
                userId,
                token,
                converted != null ? converted.getAuthorities() : null
        );
    }
}
