package com.lci.rtls.positioning.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

/**
 * Habilita JPA Auditing para que los campos {@code @CreatedBy}, {@code @CreatedDate},
 * {@code @LastModifiedBy} y {@code @LastModifiedDate} se rellenen automáticamente.
 *
 * <p>El "auditor" (quién hace la operación) es el {@code Authentication.getName()}
 * del contexto de seguridad. En operaciones del sistema (sin contexto, p.ej. desde
 * el ingest MQTT) se rellena con {@code "system"}.
 */
@Configuration
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
public class JpaAuditingConfig {

    @Bean
    public AuditorAware<String> auditorProvider() {
        return () -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
                return Optional.of("system");
            }
            return Optional.of(auth.getName());
        };
    }
}
