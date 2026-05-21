package com.lci.rtls.positioning.events;

import com.lci.rtls.positioning.events.dto.EventCommentCreateDto;
import com.lci.rtls.positioning.events.dto.EventCommentDto;
import com.lci.rtls.positioning.events.dto.EventDetailDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/events")
@RequiredArgsConstructor
public class EventDetailController {

    private final EventDetailService service;

    /**
     * Detalle unificado de un evento (PROXIMITY o SOS). Incluye worker, tag,
     * ack/help/resolve/cancel metadata y comentarios. Usado por el modal del
     * replay y por las tablas de eventos de la ficha de trabajador.
     */
    @GetMapping("/{type}/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    public EventDetailDto getDetail(@PathVariable String type, @PathVariable Long id) {
        return service.getDetail(type, id);
    }

    @PostMapping("/{type}/{id}/comments")
    @PreAuthorize("hasAnyRole('ADMIN','OPERATOR','USER')")
    @ResponseStatus(HttpStatus.CREATED)
    public EventCommentDto addComment(@PathVariable String type, @PathVariable Long id,
                                       @Valid @RequestBody EventCommentCreateDto dto) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String username = auth != null ? auth.getName() : "system";
        // displayName: si tenemos un claim "name" en el JWT, lo cogemos —
        // si no, caemos al username plano.
        String display = username;
        if (auth != null && auth.getPrincipal() instanceof org.springframework.security.oauth2.jwt.Jwt jwt) {
            Object name = jwt.getClaims().get("name");
            if (name instanceof String s && !s.isBlank()) display = s;
        }
        return service.addComment(type, id, username, display, dto.commentText());
    }
}
