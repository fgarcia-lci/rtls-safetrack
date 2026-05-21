package com.lci.rtls.positioning.playback;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/v1/playback")
@RequiredArgsConstructor
public class PlaybackController {

    private final PlaybackService service;

    /**
     * Devuelve un snapshot batch del estado de la planta en el rango pedido —
     * pensado para que el reproductor temporal del frontend lo cargue una vez
     * y avance localmente. Cap duro de 24h.
     *
     * <p>Acceso: cualquier rol con permiso de lectura (no es admin-only —
     * cualquier supervisor querría usarlo para forense).
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public PlaybackDto playback(
            @RequestParam String plantId,
            @RequestParam Instant from,
            @RequestParam Instant to,
            @RequestParam(required = false) Integer resolutionSeconds
    ) {
        return service.getPlayback(plantId, from, to, resolutionSeconds);
    }
}
