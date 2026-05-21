package com.lci.rtls.positioning.events;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import jakarta.persistence.EntityListeners;
import java.time.Instant;

/**
 * Comentario libre asociado a un evento (proximity entry o SOS). Pensado
 * para supervisores que añaden contexto post-mortem: "Era un simulacro",
 * "Operario formado tras este incidente", etc. Inmutable; solo se añade.
 */
@Entity
@Table(name = "pos_event_comments")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private EventType eventType;

    @Column(name = "event_id", nullable = false)
    private Long eventId;

    @Column(name = "author_username", nullable = false, length = 150)
    private String authorUsername;

    /** Nombre legible al autor en el momento del comentario. Se persiste
     *  para no depender de un lookup futuro si el usuario desaparece. */
    @Column(name = "author_display", length = 200)
    private String authorDisplay;

    @Column(name = "comment_text", nullable = false, columnDefinition = "TEXT")
    private String commentText;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public enum EventType { PROXIMITY, SOS }
}
