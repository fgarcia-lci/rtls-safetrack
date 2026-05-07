package com.lci.rtls.positioning.zone;

import com.lci.rtls.positioning.zone.dto.ProximityEventDto;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST de eventos de proximidad. Lectura para el panel de alertas y POST
 * para acknowledgear.
 *
 * <p>Lectura: cualquier rol con acceso a Safetrack (ADMIN, OPERATOR, USER).
 * <br>ACK: ADMIN u OPERATOR (no USER de solo lectura).
 */
@RestController
@RequestMapping("/v1/proximity-events")
@RequiredArgsConstructor
public class ProximityEventController {

    private final ProximityEventService service;

    /**
     * Lista eventos de una planta. Si {@code open=true}, devuelve solo los
     * que aún no han cerrado (operario sigue dentro). Sin filtro,
     * histórico completo más reciente primero.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public List<ProximityEventDto> list(
            @RequestParam String plantId,
            @RequestParam(required = false) Boolean open
    ) {
        if (Boolean.TRUE.equals(open)) {
            return service.listOpenByPlant(plantId);
        }
        return service.listByPlant(plantId);
    }

    /**
     * ACK de un evento. Setea {@code acknowledgedAt = now} y
     * {@code acknowledgedBy = currentUser.sub}. Idempotente.
     */
    @PostMapping("/{id}/ack")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR')")
    public ProximityEventDto ack(@PathVariable Long id) {
        return service.acknowledge(id);
    }
}
