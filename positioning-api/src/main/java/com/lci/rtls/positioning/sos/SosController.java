package com.lci.rtls.positioning.sos;

import com.lci.rtls.positioning.sos.dto.SosEventDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/v1/sos")
@RequiredArgsConstructor
public class SosController {

    private final SosService sosService;

    /** Lista de SOS activos (no resueltos / cancelados) de una planta — feed del panel guardia. */
    @GetMapping("/active")
    public List<SosEventDto> listActive(@RequestParam String plantId) {
        return sosService.listActive(plantId).stream().map(SosEventDto::from).toList();
    }

    /** Histórico completo para auditoría. */
    @GetMapping("/history")
    public List<SosEventDto> history(@RequestParam String plantId) {
        return sosService.listAll(plantId).stream().map(SosEventDto::from).toList();
    }

    /**
     * Disparo manual desde la UI admin — para demos sin hardware. Publica
     * un SOS como si el tag físico hubiera pulsado el botón.
     */
    @PostMapping("/simulate")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISOR')")
    public ResponseEntity<SosEventDto> simulate(
            @RequestParam String tagSerial,
            @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt != null ? jwt.getSubject() : "anonymous";
        SosEvent ev = sosService.triggerManualForDemo(tagSerial, userId);
        return ResponseEntity.ok(SosEventDto.from(ev));
    }

    @PostMapping("/{id}/ack")
    public ResponseEntity<SosEventDto> ack(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt != null ? jwt.getSubject() : "anonymous";
        return ResponseEntity.ok(SosEventDto.from(sosService.ack(id, userId)));
    }

    @PostMapping("/{id}/help-sent")
    public ResponseEntity<SosEventDto> sendHelp(
            @PathVariable Long id,
            @RequestBody(required = false) NotesBody body,
            @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt != null ? jwt.getSubject() : "anonymous";
        String notes = body != null ? body.notes : null;
        return ResponseEntity.ok(SosEventDto.from(sosService.sendHelp(id, userId, notes)));
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<SosEventDto> resolve(
            @PathVariable Long id,
            @RequestBody(required = false) NotesBody body,
            @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt != null ? jwt.getSubject() : "anonymous";
        String notes = body != null ? body.notes : null;
        return ResponseEntity.ok(SosEventDto.from(sosService.resolve(id, userId, notes)));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<SosEventDto> cancel(
            @PathVariable Long id,
            @RequestBody(required = false) NotesBody body,
            @AuthenticationPrincipal Jwt jwt) {
        String userId = jwt != null ? jwt.getSubject() : "anonymous";
        String reason = body != null ? body.notes : "Falso positivo";
        return ResponseEntity.ok(SosEventDto.from(sosService.cancel(id, userId, reason)));
    }

    public record NotesBody(String notes) {}
}
