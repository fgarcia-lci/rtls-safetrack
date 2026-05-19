package com.lci.rtls.positioning.notification;

import com.lci.rtls.positioning.worker.Worker;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * Registro permanente de cada notificación enviada por el sistema (alertas
 * de proximidad, SOS, ACKs). Sirve como auditoría: "cuando entró Juan en la
 * zona X, ¿a quién avisamos, por qué canal, llegó?".
 *
 * <p>No vinculamos {@code eventId} con FK declarada porque puede apuntar a
 * {@code pos_proximity_events} o a {@code pos_sos_events} según {@code eventKind}.
 */
@Entity
@Table(name = "pos_notification_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Instant ts;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_kind", nullable = false, length = 32)
    private EventKind eventKind;

    @Column(name = "event_id")
    private Long eventId;

    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "plant_id", nullable = false, length = 50)
    private String plantId;

    /** Persona que recibió la notificación (FK obligatoria). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_person_id", nullable = false)
    private Worker recipient;

    @Enumerated(EnumType.STRING)
    @Column(name = "recipient_role", nullable = false, length = 32)
    private RecipientRole recipientRole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Channel channel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(length = 200)
    private String reason;

    public enum EventKind { PROXIMITY_ENTER, PROXIMITY_EXIT, SOS, ACK, OTHER }
    public enum RecipientRole {
        WORKER,
        SUPERVISOR,
        BACKUP_SUPERVISOR,
        COMPANY_MANAGER,
        SAFETY,
        MANAGERS,
        OTHER,
    }
    public enum Channel { IN_APP, EMAIL, HAPTIC_MQTT, SMS, PUSH }
    public enum Status { SENT, FAILED, SKIPPED }
}
