package com.lci.rtls.positioning.zone;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Política de notificaciones por zona — a quién avisar y por qué canales.
 * Mapea {@code pos_zone_notification_policies}. Si una zona no tiene fila en
 * esta tabla, el dispatcher aplica el default: solo háptica al worker + IN_APP.
 *
 * <p>El {@code ProximityNotificationDispatcher} lee la policy y resuelve
 * destinatarios:
 * <ul>
 *   <li>{@code notifyWorker} + {@code channelHapticMqtt} → publica
 *       {@code HapticCommand} al broker.</li>
 *   <li>{@code notifySupervisor} → resuelve {@code Worker.supervisorUserId}.</li>
 *   <li>{@code notifySafetyTeam} → users con {@code ROLE_OPERATOR}.</li>
 *   <li>{@code notifyAllManagers} → users con permiso {@code PLANT_MANAGE}.</li>
 * </ul>
 */
@Entity
@Table(name = "pos_zone_notification_policies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ZoneNotificationPolicy {

    /** PK = FK a {@code pos_safety_zones.id}. Relación 1:1. */
    @Id
    @Column(name = "zone_id")
    private Long zoneId;

    @Column(name = "notify_worker", nullable = false)
    private boolean notifyWorker;

    @Column(name = "notify_supervisor", nullable = false)
    private boolean notifySupervisor;

    @Column(name = "notify_safety_team", nullable = false)
    private boolean notifySafetyTeam;

    @Column(name = "notify_all_managers", nullable = false)
    private boolean notifyAllManagers;

    @Column(name = "channel_in_app", nullable = false)
    private boolean channelInApp;

    @Column(name = "channel_email", nullable = false)
    private boolean channelEmail;

    @Column(name = "channel_haptic_mqtt", nullable = false)
    private boolean channelHapticMqtt;

    /** JSON array de userIds para override puntual. Nullable. */
    @Column(name = "custom_recipients", columnDefinition = "JSON")
    private String customRecipients;
}
