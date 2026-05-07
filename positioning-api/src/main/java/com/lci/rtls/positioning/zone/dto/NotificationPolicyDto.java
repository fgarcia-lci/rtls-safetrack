package com.lci.rtls.positioning.zone.dto;

import com.lci.rtls.positioning.zone.ZoneNotificationPolicy;

/**
 * Política de notificación de una zona expuesta vía REST.
 *
 * <p>Si una zona no tiene fila en {@code pos_zone_notification_policies}, el
 * service la expone con {@link #defaults()}: háptica al worker + IN_APP, sin
 * email, sin escalado a supervisores ni managers.
 */
public record NotificationPolicyDto(
        boolean notifyWorker,
        boolean notifySupervisor,
        boolean notifySafetyTeam,
        boolean notifyAllManagers,
        boolean channelInApp,
        boolean channelEmail,
        boolean channelHapticMqtt
) {

    public static NotificationPolicyDto defaults() {
        return new NotificationPolicyDto(true, false, false, false, true, false, true);
    }

    public static NotificationPolicyDto from(ZoneNotificationPolicy p) {
        if (p == null) return defaults();
        return new NotificationPolicyDto(
                p.isNotifyWorker(),
                p.isNotifySupervisor(),
                p.isNotifySafetyTeam(),
                p.isNotifyAllManagers(),
                p.isChannelInApp(),
                p.isChannelEmail(),
                p.isChannelHapticMqtt()
        );
    }

    public ZoneNotificationPolicy toEntity(Long zoneId) {
        return ZoneNotificationPolicy.builder()
                .zoneId(zoneId)
                .notifyWorker(notifyWorker)
                .notifySupervisor(notifySupervisor)
                .notifySafetyTeam(notifySafetyTeam)
                .notifyAllManagers(notifyAllManagers)
                .channelInApp(channelInApp)
                .channelEmail(channelEmail)
                .channelHapticMqtt(channelHapticMqtt)
                .build();
    }
}
