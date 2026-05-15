package com.lci.rtls.positioning.sos;

import com.lci.rtls.positioning.sos.dto.SosMqttPayload;
import com.lci.rtls.positioning.sos.dto.SosNotificationDto;
import com.lci.rtls.positioning.tag.Tag;
import com.lci.rtls.positioning.tag.TagRepository;
import com.lci.rtls.positioning.worker.Worker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Servicio central del flujo SOS. Tres entradas:
 *
 * <ol>
 *   <li>{@link #onSosFromMqtt(String, SosMqttPayload)} — disparado por
 *       {@code MqttSubscriberService} al recibir mensaje en
 *       {@code .../tag/{tagId}/sos}. Es el flujo real de hardware.</li>
 *   <li>{@link #triggerManualForDemo(String, String)} — disparado desde
 *       endpoint REST admin para demos. Genera un evento "como si" hubiera
 *       llegado por MQTT.</li>
 *   <li>{@link #ack(Long, String)} / {@link #sendHelp(Long, String, String)} /
 *       {@link #resolve(Long, String, String)} / {@link #cancel(Long, String, String)} —
 *       transiciones de ciclo de vida desde la UI.</li>
 * </ol>
 *
 * <p>Todas las acciones acaban en {@link #broadcast(SosEvent)} que empuja al
 * WebSocket {@code /topic/sos/{plantId}} para que el frontend reaccione.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SosService {

    private final SosEventRepository sosRepo;
    private final TagRepository tagRepo;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Entrada principal desde el MQTT subscriber. El payload trae el serial
     * del tag y la planta; resolvemos el worker actualmente asignado.
     */
    @Transactional
    public SosEvent onSosFromMqtt(String tagSerial, SosMqttPayload payload) {
        log.warn("🆘 SOS recibido por MQTT tagSerial={} plant={}", tagSerial, payload.plant_id());
        Optional<Tag> tagOpt = tagRepo.findBySerial(tagSerial);
        if (tagOpt.isEmpty()) {
            log.warn("SOS de tag desconocido (no registrado): {}. Se crea evento huérfano.", tagSerial);
        }
        Tag tag = tagOpt.orElse(null);
        Worker worker = tag != null ? tag.getAssignedWorker() : null;

        Instant triggeredAt = payload.pressed_at() != null ? payload.pressed_at() : Instant.now();

        SosEvent ev = SosEvent.builder()
                .tagId(tag != null ? tag.getId() : -1L) // -1 = tag desconocido (auditoría)
                .workerId(worker != null ? worker.getId() : null)
                .plantId(payload.plant_id() != null ? payload.plant_id() : (tag != null ? tag.getPlantId() : "UNKNOWN"))
                .triggeredAt(triggeredAt)
                .status(SosEvent.Status.REQUESTED)
                .build();
        SosEvent saved = sosRepo.save(ev);

        broadcast(saved, tag, worker);
        return saved;
    }

    /**
     * Disparo manual desde la UI admin (botón demo). Es idéntico al flujo
     * MQTT pero con timestamp = ahora y sin payload de hardware.
     */
    @Transactional
    public SosEvent triggerManualForDemo(String tagSerial, String triggeredByUserId) {
        log.info("SOS MANUAL (demo) tagSerial={} byUser={}", tagSerial, triggeredByUserId);
        SosMqttPayload fakePayload = new SosMqttPayload(
                tagSerial, null, Instant.now(), null, null, "manual-demo", "manual"
        );
        return onSosFromMqtt(tagSerial, fakePayload);
    }

    @Transactional
    public SosEvent ack(Long sosId, String userId) {
        SosEvent ev = mustExist(sosId);
        if (ev.getStatus() != SosEvent.Status.REQUESTED) {
            log.warn("SOS {} no está en REQUESTED, estado actual: {}", sosId, ev.getStatus());
        }
        ev.setStatus(SosEvent.Status.ACKED);
        ev.setAckedAt(Instant.now());
        ev.setAckedBy(userId);
        SosEvent saved = sosRepo.save(ev);
        broadcast(saved);
        return saved;
    }

    @Transactional
    public SosEvent sendHelp(Long sosId, String userId, String notes) {
        SosEvent ev = mustExist(sosId);
        ev.setStatus(SosEvent.Status.HELP_SENT);
        ev.setHelpSentAt(Instant.now());
        ev.setHelpSentBy(userId);
        ev.setHelpNotes(notes);
        SosEvent saved = sosRepo.save(ev);
        broadcast(saved);
        return saved;
    }

    @Transactional
    public SosEvent resolve(Long sosId, String userId, String notes) {
        SosEvent ev = mustExist(sosId);
        ev.setStatus(SosEvent.Status.RESOLVED);
        ev.setResolvedAt(Instant.now());
        ev.setResolvedBy(userId);
        ev.setResolutionNotes(notes);
        SosEvent saved = sosRepo.save(ev);
        broadcast(saved);
        return saved;
    }

    @Transactional
    public SosEvent cancel(Long sosId, String userId, String reason) {
        SosEvent ev = mustExist(sosId);
        ev.setStatus(SosEvent.Status.CANCELLED);
        ev.setCancelledAt(Instant.now());
        ev.setCancelledBy(userId);
        ev.setCancelReason(reason);
        SosEvent saved = sosRepo.save(ev);
        broadcast(saved);
        return saved;
    }

    public List<SosEvent> listActive(String plantId) {
        return sosRepo.findActiveByPlant(plantId);
    }

    public List<SosEvent> listAll(String plantId) {
        return sosRepo.findAllByPlant(plantId);
    }

    // ---------- helpers ----------

    private SosEvent mustExist(Long id) {
        return sosRepo.findById(id).orElseThrow(() ->
                new IllegalArgumentException("SOS event not found: " + id));
    }

    /** Versión simplificada cuando ya tenemos el evento pero no el tag/worker. */
    private void broadcast(SosEvent ev) {
        Tag tag = ev.getTagId() != null && ev.getTagId() > 0
                ? tagRepo.findById(ev.getTagId()).orElse(null) : null;
        Worker worker = tag != null ? tag.getAssignedWorker() : null;
        broadcast(ev, tag, worker);
    }

    private void broadcast(SosEvent ev, Tag tag, Worker worker) {
        SosNotificationDto dto = new SosNotificationDto(
                ev.getId(),
                ev.getTriggeredAt(),
                SosNotificationDto.Status.valueOf(ev.getStatus().name()),
                tag != null ? tag.getSerial() : null,
                worker != null ? worker.getId() : null,
                worker != null ? worker.getFullName() : null,
                worker != null ? worker.getEmployeeCode() : null,
                worker != null ? worker.getPhotoUrl() : null,
                worker != null ? worker.getCompanyName() : null,
                worker != null ? worker.getCompanyType() : null,
                worker != null ? worker.getRoleInPlant() : null,
                worker != null ? worker.getPhone() : null,
                null, null, null,  // posX/Y/Z — pendiente integrar con tracker de últimas posiciones
                null,              // zonesAtTrigger
                null,              // nearbyWorkerIds
                tag != null ? tag.getBatteryLastPct() : null,
                null               // rssiDbm
        );

        String topic = "/topic/sos/" + ev.getPlantId();
        messagingTemplate.convertAndSend(topic, dto);
        log.info("SOS broadcast id={} status={} topic={}", ev.getId(), ev.getStatus(), topic);
    }
}
