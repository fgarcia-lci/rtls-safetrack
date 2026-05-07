package com.lci.rtls.positioning.zone;

import com.lci.rtls.positioning.mqtt.MqttCommandPublisher;
import com.lci.rtls.positioning.mqtt.model.HapticCommand;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.zone.dto.AlertNotificationDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Despacha notificaciones cuando un operario entra/sale de una zona.
 *
 * <p>Lee la {@link ZoneNotificationPolicy} de la zona (con default si no
 * existe) y emite por los canales habilitados:
 * <ul>
 *   <li><b>IN_APP</b> ({@code channelInApp}): publica
 *       {@link AlertNotificationDto} a {@code /topic/alerts/{plantId}} STOMP.</li>
 *   <li><b>EMAIL</b> ({@code channelEmail}): stub — solo loguea. La
 *       integración real se hará cuando exista módulo SMTP en el DT.</li>
 *   <li><b>HAPTIC_MQTT</b> ({@code notifyWorker} + {@code channelHapticMqtt}):
 *       publica un {@link HapticCommand} al broker para que el firmware del
 *       tag haga vibrar al operario.</li>
 * </ul>
 *
 * <p>Si la zona NO tiene fila en {@code pos_zone_notification_policies}, el
 * dispatcher aplica el default seguro: háptica al operario + IN_APP, sin
 * email ni escalado a managers.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProximityNotificationDispatcher {

    private final ZoneNotificationPolicyRepository policyRepo;
    private final TagRepository tagRepo;
    private final SimpMessagingTemplate messagingTemplate;
    private final MqttCommandPublisher mqttPublisher;

    /**
     * Disparado por {@code ZoneEngineService} cuando un tag ENTRA en una zona.
     */
    public void onEnter(ProximityEvent event, SafetyZone zone) {
        ZoneNotificationPolicy policy = resolvePolicy(zone.getId());
        Tag tag = tagRepo.findById(event.getTagId()).orElse(null);
        if (tag == null) {
            log.warn("Tag id={} no encontrado al despachar ENTER", event.getTagId());
            return;
        }
        Worker worker = tag.getAssignedWorker();

        log.warn("[Proximity] ENTER tag={} zone={} severity={} eventId={}",
                tag.getSerial(), zone.getCode(), zone.getSeverity(), event.getId());

        if (policy.isChannelInApp()) {
            sendInApp(zone.getPlantId(), buildAlert(event, zone, tag, worker,
                    AlertNotificationDto.EventKind.ENTER,
                    AlertNotificationDto.AlertState.OPEN,
                    null));
        }

        if (policy.isChannelEmail()) {
            // Stub PoC — log only. Cuando integremos con SMTP del DT, encolar.
            log.info("[Proximity][EMAIL stub] would notify ENTER zone={} worker={}",
                    zone.getCode(), worker != null ? worker.getFullName() : "(unassigned)");
        }

        if (policy.isNotifyWorker() && policy.isChannelHapticMqtt()) {
            HapticCommand.Pattern pattern = mapSeverityToHapticPattern(zone);
            mqttPublisher.publishHaptic(zone.getPlantId(), tag.getSerial(),
                    HapticCommand.of(pattern, 800));
        }
    }

    /**
     * Disparado por {@code ZoneEngineService} cuando un tag SALE de una zona.
     */
    public void onExit(ProximityEvent event, SafetyZone zone) {
        long secs = (event.getEnteredAt() != null && event.getExitedAt() != null)
                ? Duration.between(event.getEnteredAt(), event.getExitedAt()).toSeconds()
                : 0;
        ZoneNotificationPolicy policy = resolvePolicy(zone.getId());
        Tag tag = tagRepo.findById(event.getTagId()).orElse(null);
        if (tag == null) return;
        Worker worker = tag.getAssignedWorker();

        log.info("[Proximity] EXIT tag={} zone={} duration={}s eventId={}",
                tag.getSerial(), zone.getCode(), secs, event.getId());

        if (policy.isChannelInApp()) {
            sendInApp(zone.getPlantId(), buildAlert(event, zone, tag, worker,
                    AlertNotificationDto.EventKind.EXIT,
                    AlertNotificationDto.AlertState.CLOSED,
                    secs));
        }
        // No volvemos a hacer vibrar el tag al salir — ya lo notificó al entrar.
    }

    // ---- helpers ----

    private ZoneNotificationPolicy resolvePolicy(Long zoneId) {
        return policyRepo.findById(zoneId).orElseGet(() -> ZoneNotificationPolicy.builder()
                .zoneId(zoneId)
                .notifyWorker(true)
                .notifySupervisor(false)
                .notifySafetyTeam(false)
                .notifyAllManagers(false)
                .channelInApp(true)
                .channelEmail(false)
                .channelHapticMqtt(true)
                .build());
    }

    private void sendInApp(String plantId, AlertNotificationDto alert) {
        messagingTemplate.convertAndSend("/topic/alerts/" + plantId, alert);
    }

    private AlertNotificationDto buildAlert(
            ProximityEvent event, SafetyZone zone, Tag tag, Worker worker,
            AlertNotificationDto.EventKind kind, AlertNotificationDto.AlertState state,
            Long durationSec
    ) {
        return new AlertNotificationDto(
                event.getId(),
                kind,
                state,
                Instant.now(),
                tag.getSerial(),
                worker != null ? worker.getFullName() : null,
                worker != null ? worker.getEmployeeCode() : null,
                zone.getId(),
                zone.getCode(),
                zone.getName(),
                zone.getType(),
                zone.getSeverity(),
                zone.getDisplayColor(),
                durationSec
        );
    }

    private HapticCommand.Pattern mapSeverityToHapticPattern(SafetyZone zone) {
        if (zone.getType() == ZoneType.INFO || zone.getType() == ZoneType.SAFE) {
            return HapticCommand.Pattern.INFO;
        }
        Integer sev = zone.getSeverity() != null ? zone.getSeverity() : 3;
        if (sev >= 4) return HapticCommand.Pattern.DANGER;
        if (sev == 3) return HapticCommand.Pattern.WARNING;
        return HapticCommand.Pattern.INFO;
    }
}
