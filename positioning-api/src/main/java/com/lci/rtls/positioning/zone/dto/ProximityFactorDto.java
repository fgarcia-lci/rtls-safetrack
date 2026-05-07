package com.lci.rtls.positioning.zone.dto;

/**
 * Estado de proximidad de un tag respecto a una zona, emitido por
 * {@code ZoneEngineService} via WebSocket en {@code /topic/proximity/{plantId}}.
 *
 * <p>{@code factor ∈ [0, 1]}: 0 = fuera del buffer de aproximación, 1 = dentro
 * del polígono (intersección de altura incluida). Valores intermedios indican
 * que el tag está dentro del buffer pero fuera del polígono — el frontend
 * usa esto para escalar el color de la zona y del halo del muñequito.
 *
 * <p>Solo se emiten pares (tag, zona) con {@code factor > 0}, para no
 * saturar el canal con pares irrelevantes.
 */
public record ProximityFactorDto(
        String tagId,
        Long zoneId,
        double factor,
        ProximityState state
) {
    public enum ProximityState {
        OUTSIDE,
        APPROACHING,
        INSIDE
    }
}
