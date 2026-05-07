package com.lci.rtls.positioning.zone.dto;

import java.time.Instant;
import java.util.List;

/**
 * Batch de proximidades emitido por {@code ZoneEngineService} cada tick. La
 * lista contiene SOLO los pares (tag, zona) con {@code factor > 0}.
 */
public record ProximityBatchDto(
        Instant ts,
        List<ProximityFactorDto> proximities
) {}
