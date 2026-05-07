package com.lci.rtls.positioning.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    /**
     * URL del JWKS del auth-server. En docker se sobreescribe con
     * {@code host.docker.internal} porque {@code localhost} dentro del
     * contenedor no puede llegar al auth-server del host.
     */
    @Value("${rtls.auth.jwk-set-uri:http://localhost:9000/oauth2/jwks}")
    private String jwkSetUri;

    /**
     * Issuer esperado en el claim {@code iss} del JWT. Coincide con lo que
     * emite el auth-server (típicamente {@code http://localhost:9000}).
     */
    @Value("${rtls.auth.expected-issuer:http://localhost:9000}")
    private String expectedIssuer;

    /**
     * JwtDecoder personalizado: desacopla la URL de fetch del JWKS
     * (alcanzable desde el contenedor docker) del issuer esperado en el
     * claim {@code iss} del JWT. Así el api valida tokens con
     * {@code iss=http://localhost:9000} aunque desde docker la JWKS se
     * sirva en {@code host.docker.internal:9000}.
     */
    @Bean
    JwtDecoder jwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(expectedIssuer));
        return decoder;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            JwtAuthenticationConverter jwtAuthConverter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> {})
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/management/health/**", "/management/info").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .requestMatchers("/error").permitAll()
                .requestMatchers("/ws/**").permitAll()
                .requestMatchers("/v1/**").authenticated()
                .anyRequest().denyAll()
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthConverter)));
        return http.build();
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        var conv = new JwtAuthenticationConverter();
        conv.setJwtGrantedAuthoritiesConverter(jwt -> {
            Set<org.springframework.security.core.GrantedAuthority> authorities = new HashSet<>();

            var scopeConverter = new JwtGrantedAuthoritiesConverter();
            scopeConverter.setAuthorityPrefix("SCOPE_");
            scopeConverter.setAuthoritiesClaimName("scope");
            authorities.addAll(scopeConverter.convert(jwt));

            Object authoritiesClaim = jwt.getClaim("authorities");
            if (authoritiesClaim instanceof java.util.Collection<?> authList) {
                for (Object a : authList) {
                    if (a instanceof String s) {
                        authorities.add(new org.springframework.security.core.authority.SimpleGrantedAuthority(s));
                    }
                }
            }
            return authorities;
        });
        return conv;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        String originsEnv = System.getenv().getOrDefault("CORS_ALLOWED_ORIGINS", "http://localhost:5180");
        cfg.setAllowedOrigins(List.of(originsEnv.split(",")));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "X-Requested-With", "Origin"));
        cfg.setExposedHeaders(List.of("Location"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
