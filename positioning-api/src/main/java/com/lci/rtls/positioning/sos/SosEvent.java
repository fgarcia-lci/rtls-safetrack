package com.lci.rtls.positioning.sos;

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

import java.time.Instant;

/**
 * Petición de SOS / botón de pánico del operario. Modelo separado de
 * {@link com.lci.rtls.positioning.zone.ProximityEvent} porque la naturaleza,
 * política de notificación y ciclo de vida son distintos.
 *
 * <p>Ciclo: {@code REQUESTED → ACKED → HELP_SENT → RESOLVED}.
 * Rama alternativa: {@code REQUESTED → CANCELLED} (falso positivo).
 * El registro nunca se borra — auditoría permanente.
 */
@Entity
@Table(name = "pos_sos_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SosEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * FK a {@code pos_persons.id}. NULL si el tag no estaba asignado al pulsar.
     * Columna renombrada en V13. Campo Java mantiene nombre {@code workerId}
     * por compatibilidad con services/DTOs existentes.
     */
    @Column(name = "person_id")
    private Long workerId;

    @Column(name = "tag_id", nullable = false)
    private Long tagId;

    @Column(name = "plant_id", nullable = false, length = 50)
    private String plantId;

    @Column(name = "triggered_at", nullable = false)
    private Instant triggeredAt;

    /** JSON {@code {"x":..,"y":..,"z":..}} última posición conocida al pulsar. */
    @Column(name = "triggered_point", columnDefinition = "JSON")
    private String triggeredPoint;

    /** JSON array de ids de zonas en las que estaba al pulsar. */
    @Column(name = "zones_at_trigger", columnDefinition = "JSON")
    private String zonesAtTrigger;

    /** JSON array de worker_ids cercanos (<10 m) al pulsar. */
    @Column(name = "nearby_worker_ids", columnDefinition = "JSON")
    private String nearbyWorkerIds;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status;

    @Column(name = "acked_at")
    private Instant ackedAt;

    @Column(name = "acked_by", length = 36)
    private String ackedBy;

    @Column(name = "help_sent_at")
    private Instant helpSentAt;

    @Column(name = "help_sent_by", length = 36)
    private String helpSentBy;

    @Column(name = "help_notes", columnDefinition = "TEXT")
    private String helpNotes;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by", length = 36)
    private String resolvedBy;

    @Column(name = "resolution_notes", columnDefinition = "TEXT")
    private String resolutionNotes;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by", length = 36)
    private String cancelledBy;

    @Column(name = "cancel_reason", columnDefinition = "TEXT")
    private String cancelReason;

    /** JSON array de acciones disparadas (canal, timestamp, destinatario). */
    @Column(name = "actions_taken", columnDefinition = "JSON")
    private String actionsTaken;

    public enum Status {
        /** Recién pulsado. Aún nadie lo ha visto / atendido. */
        REQUESTED,
        /** Algún operador/vigilante lo ha visto y aceptado la responsabilidad. */
        ACKED,
        /** Se ha enviado ayuda (brigada, mantenimiento, otro operario). */
        HELP_SENT,
        /** Situación cerrada — operario a salvo. */
        RESOLVED,
        /** Falso positivo / botón pulsado sin querer. Registro permanente. */
        CANCELLED,
    }
}
