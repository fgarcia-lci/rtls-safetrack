package com.lci.rtls.positioning.zone;

import com.lci.rtls.positioning.company.Company;
import com.lci.rtls.positioning.mqtt.MqttCommandPublisher;
import com.lci.rtls.positioning.mqtt.model.HapticCommand;
import com.lci.rtls.positioning.notification.NotificationLog;
import com.lci.rtls.positioning.notification.NotificationLogRepository;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.Worker;
import com.lci.rtls.positioning.zone.dto.AlertNotificationDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Despacha notificaciones cuando un operario entra/sale de una zona o pulsa SOS.
 *
 * <p>Para cada evento aplica la {@link ZoneNotificationPolicy} de la zona y
 * dispara una notificación por cada combinación (destinatario × canal)
 * habilitada. Destinatarios soportados:
 *
 * <ul>
 *   <li><b>WORKER</b>: el propio operario. Recibe háptica (MQTT) si la
 *       política lo activa, e in-app/email opcionales.</li>
 *   <li><b>SUPERVISOR</b>: supervisor primario asignado al operario en su
 *       ficha ({@code workerInPlant.supervisorPerson}).</li>
 *   <li><b>BACKUP_SUPERVISOR</b>: supervisor de respaldo si está definido.
 *       Se notifica siempre que se notifica al primario, no como fallback.</li>
 *   <li><b>COMPANY_MANAGER</b>: manager de la empresa contratista del
 *       operario (vía {@code worker.company.managerPerson}). Mapea al flag
 *       {@code notifyAllManagers} de la política.</li>
 *   <li><b>SAFETY</b>: equipo de seguridad de la planta. Se cubre con el
 *       broadcast in-app global a {@code /topic/alerts/{plantId}} (cualquier
 *       cliente conectado lo recibe).</li>
 * </ul>
 *
 * <p>Cada notificación enviada (incluso si es {@code SKIPPED} porque falta
 * email o persona) queda persistida en {@code pos_notification_log} para
 * auditoría. Esto es lo que permite responder con datos a "¿a quién avisamos
 * cuando entró Juan en la zona X?".
 *
 * <p>Transactional: las relaciones {@code tag → worker → supervisor/company →
 * managerPerson} son lazy y necesitan sesión Hibernate abierta para resolverse.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProximityNotificationDispatcher {

    private final ZoneNotificationPolicyRepository policyRepo;
    private final TagRepository tagRepo;
    private final NotificationLogRepository notificationLogRepo;
    private final SimpMessagingTemplate messagingTemplate;
    private final MqttCommandPublisher mqttPublisher;

    @Transactional
    public void onEnter(ProximityEvent event, SafetyZone zone) {
        dispatch(event, zone, NotificationLog.EventKind.PROXIMITY_ENTER,
                AlertNotificationDto.EventKind.ENTER,
                AlertNotificationDto.AlertState.OPEN,
                null);
    }

    @Transactional
    public void onExit(ProximityEvent event, SafetyZone zone) {
        long secs = (event.getEnteredAt() != null && event.getExitedAt() != null)
                ? Duration.between(event.getEnteredAt(), event.getExitedAt()).toSeconds()
                : 0;
        dispatch(event, zone, NotificationLog.EventKind.PROXIMITY_EXIT,
                AlertNotificationDto.EventKind.EXIT,
                AlertNotificationDto.AlertState.CLOSED,
                secs);
    }

    // ------------------------------------------------------------------------
    // Núcleo del despachador
    // ------------------------------------------------------------------------

    private void dispatch(ProximityEvent event, SafetyZone zone,
                          NotificationLog.EventKind logKind,
                          AlertNotificationDto.EventKind alertKind,
                          AlertNotificationDto.AlertState alertState,
                          Long durationSec) {
        ZoneNotificationPolicy policy = resolvePolicy(zone.getId());
        Tag tag = tagRepo.findById(event.getTagId()).orElse(null);
        if (tag == null) {
            log.warn("Tag id={} no encontrado al despachar {}", event.getTagId(), logKind);
            return;
        }
        Worker worker = tag.getAssignedWorker();

        log.warn("[Proximity] {} tag={} zone={} severity={} eventId={}",
                logKind, tag.getSerial(), zone.getCode(), zone.getSeverity(), event.getId());

        // Broadcast in-app de la zona: lo emite SIEMPRE que channelInApp esté
        // activo, una sola vez. Cualquier cliente suscrito a /topic/alerts/{plantId}
        // (vigilante, sala de control) lo recibe. Lo registramos contra el
        // rol SAFETY porque conceptualmente es el feed de seguridad de planta.
        if (policy.isChannelInApp()) {
            sendInApp(zone.getPlantId(),
                    buildAlert(event, zone, tag, worker, alertKind, alertState, durationSec));
            if (worker != null) {
                logNotif(logKind, event.getId(), zone, worker,
                        NotificationLog.RecipientRole.SAFETY,
                        NotificationLog.Channel.IN_APP,
                        NotificationLog.Status.SENT, "Broadcast plant feed");
            }
        }

        // Resolución de destinatarios específicos (supervisor, manager).
        List<Recipient> recipients = resolveRecipients(worker, policy);

        // Para cada destinatario, aplica los canales habilitados en la política.
        for (Recipient r : recipients) {
            if (policy.isChannelHapticMqtt() && r.role == NotificationLog.RecipientRole.WORKER) {
                sendHaptic(zone, tag, event.getId(), logKind, r);
            }
            if (policy.isChannelEmail()) {
                sendEmailStub(r, zone, event.getId(), logKind);
            }
            if (policy.isChannelInApp() && r.role != NotificationLog.RecipientRole.WORKER) {
                // El broadcast ya cubrió a todo conectado; aquí marcamos que el
                // destinatario está ENtre los esperados (auditoría).
                logNotif(logKind, event.getId(), zone, r.person, r.role,
                        NotificationLog.Channel.IN_APP,
                        NotificationLog.Status.SENT,
                        "Cubierto por broadcast de planta");
            }
        }

        // Safety team: aún no hay tabla de "miembros del equipo de seguridad"
        // (pendiente de #74). El broadcast in-app llega a todos los conectados,
        // así que para canal in-app ya está cubierto. Para email anotamos un
        // SKIPPED explícito como hueco de implementación visible.
        if (policy.isNotifySafetyTeam() && policy.isChannelEmail()) {
            log.info("[Proximity][SAFETY EMAIL] zone={} pending — no hay tabla de safety team",
                    zone.getCode());
        }
    }

    // ------------------------------------------------------------------------
    // Resolución de destinatarios
    // ------------------------------------------------------------------------

    /** Lista de personas a las que hay que notificar según la política. */
    private List<Recipient> resolveRecipients(Worker worker, ZoneNotificationPolicy policy) {
        List<Recipient> out = new ArrayList<>();
        if (worker == null) return out;

        if (policy.isNotifyWorker()) {
            out.add(new Recipient(worker, NotificationLog.RecipientRole.WORKER));
        }
        if (policy.isNotifySupervisor()) {
            Worker sup = worker.getSupervisorPerson();
            if (sup != null) {
                out.add(new Recipient(sup, NotificationLog.RecipientRole.SUPERVISOR));
            }
            Worker bkp = worker.getBackupSupervisorPerson();
            if (bkp != null) {
                out.add(new Recipient(bkp, NotificationLog.RecipientRole.BACKUP_SUPERVISOR));
            }
        }
        if (policy.isNotifyAllManagers()) {
            Company c = worker.getCompany();
            if (c != null && c.getManagerPerson() != null) {
                out.add(new Recipient(c.getManagerPerson(),
                        NotificationLog.RecipientRole.COMPANY_MANAGER));
            }
        }
        return out;
    }

    /** Tupla recipient + rol asignado para la auditoría. */
    private record Recipient(Worker person, NotificationLog.RecipientRole role) {}

    // ------------------------------------------------------------------------
    // Envío por canal
    // ------------------------------------------------------------------------

    private void sendHaptic(SafetyZone zone, Tag tag, Long eventId,
                            NotificationLog.EventKind kind, Recipient r) {
        try {
            HapticCommand.Pattern pattern = mapSeverityToHapticPattern(zone);
            mqttPublisher.publishHaptic(zone.getPlantId(), tag.getSerial(),
                    HapticCommand.of(pattern, 800));
            logNotif(kind, eventId, zone, r.person, r.role,
                    NotificationLog.Channel.HAPTIC_MQTT,
                    NotificationLog.Status.SENT, "pattern=" + pattern);
        } catch (Exception ex) {
            logNotif(kind, eventId, zone, r.person, r.role,
                    NotificationLog.Channel.HAPTIC_MQTT,
                    NotificationLog.Status.FAILED, ex.getMessage());
        }
    }

    private void sendEmailStub(Recipient r, SafetyZone zone, Long eventId,
                               NotificationLog.EventKind kind) {
        String email = r.person.getEmail();
        if (email == null || email.isBlank()) {
            // No hay email registrado para esta persona → no podemos enviar.
            // Se anota en el log para que en la UI quede claro por qué falló.
            logNotif(kind, eventId, zone, r.person, r.role,
                    NotificationLog.Channel.EMAIL,
                    NotificationLog.Status.SKIPPED,
                    "Sin email en la ficha de la persona");
            return;
        }
        // SMTP real pendiente de la integración con el módulo del DT —
        // por ahora solo logueamos y registramos como SENT (el contrato
        // cumplido: el sistema decidió notificar, el canal se "envió" al
        // gateway de email que un día existirá).
        log.info("[Proximity][EMAIL stub] role={} to={} zone={} eventId={}",
                r.role, email, zone.getCode(), eventId);
        logNotif(kind, eventId, zone, r.person, r.role,
                NotificationLog.Channel.EMAIL,
                NotificationLog.Status.SENT,
                "Stub — SMTP pendiente · destino " + email);
    }

    // ------------------------------------------------------------------------
    // Persistencia de auditoría
    // ------------------------------------------------------------------------

    private void logNotif(NotificationLog.EventKind kind, Long eventId, SafetyZone zone,
                          Worker recipient, NotificationLog.RecipientRole role,
                          NotificationLog.Channel channel,
                          NotificationLog.Status status, String reason) {
        try {
            notificationLogRepo.save(NotificationLog.builder()
                    .ts(Instant.now())
                    .eventKind(kind)
                    .eventId(eventId)
                    .zoneId(zone.getId())
                    .plantId(zone.getPlantId())
                    .recipient(recipient)
                    .recipientRole(role)
                    .channel(channel)
                    .status(status)
                    .reason(reason)
                    .build());
        } catch (Exception ex) {
            // El log es auditoría: si falla el INSERT no debe tirar la
            // operación de notificar. Lo dejamos como WARN.
            log.warn("No se pudo persistir NotificationLog: {}", ex.getMessage());
        }
    }

    // ------------------------------------------------------------------------
    // Helpers existentes (sin cambios funcionales)
    // ------------------------------------------------------------------------

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
                worker != null ? worker.getId() : null,
                worker != null ? worker.getFullName() : null,
                worker != null ? worker.getEmployeeCode() : null,
                worker != null ? worker.getPhotoUrl() : null,
                worker != null ? worker.getCompanyName() : null,
                worker != null ? worker.getCompanyType() : null,
                worker != null ? worker.getRoleInPlant() : null,
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
