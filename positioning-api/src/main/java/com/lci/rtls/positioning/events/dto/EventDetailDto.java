package com.lci.rtls.positioning.events.dto;

import com.lci.rtls.positioning.tag.TagState;
import com.lci.rtls.positioning.worker.CompanyType;
import com.lci.rtls.positioning.zone.ZoneType;

import java.time.Instant;
import java.util.List;

/**
 * Respuesta unificada para el modal de detalle de evento. Sirve tanto para
 * proximity como SOS — los campos que no apliquen vienen a null.
 *
 * <p>Incluye:
 * <ul>
 *   <li>Identidad del evento (type, id, timestamps).</li>
 *   <li>Datos específicos según tipo (zona / status SOS).</li>
 *   <li>Ack / help / resolution / cancel — quién, cuándo, notas.</li>
 *   <li>Trabajador implicado (snapshot actual).</li>
 *   <li>Tag asociado en el momento del evento + última batería conocida.</li>
 *   <li>Comentarios libres añadidos a posteriori.</li>
 * </ul>
 */
public record EventDetailDto(
        // ----- Evento (campos comunes) -----
        String eventType,           // "PROXIMITY" | "SOS"
        Long eventId,
        Instant startAt,            // enteredAt o triggeredAt
        Instant endAt,              // exitedAt o resolvedAt/cancelledAt
        Integer durationSec,
        String plantId,

        // ----- Proximity-specific -----
        Long zoneId,
        String zoneCode,
        String zoneName,
        ZoneType zoneType,
        Integer severity,
        Boolean authorized,

        // ----- SOS-specific -----
        String sosStatus,           // REQUESTED / ACKED / HELP_SENT / RESOLVED / CANCELLED

        // ----- Lifecycle: ack -----
        Instant ackedAt,
        String ackedBy,

        // ----- Lifecycle: help -----
        Instant helpSentAt,
        String helpSentBy,
        String helpNotes,

        // ----- Lifecycle: resolve -----
        Instant resolvedAt,
        String resolvedBy,
        String resolutionNotes,

        // ----- Lifecycle: cancel -----
        Instant cancelledAt,
        String cancelledBy,
        String cancelReason,

        // ----- Trabajador implicado -----
        Long workerId,
        String workerEmployeeCode,
        String workerFullName,
        String workerCompanyName,
        CompanyType workerCompanyType,
        String workerPhotoUrl,

        // ----- Tag asociado al evento (id viene del propio evento; el resto
        //       es info de runtime que el operador agradece tener en la
        //       misma vista). Si el tag fue retirado, la mayoría de campos
        //       vienen a null pero el id queda. -----
        Long tagId,
        String tagSerial,
        String tagModel,
        Integer tagBatteryPct,
        TagState tagState,
        Instant tagLastSeenAt,

        // ----- Comentarios libres -----
        List<EventCommentDto> comments
) {}
