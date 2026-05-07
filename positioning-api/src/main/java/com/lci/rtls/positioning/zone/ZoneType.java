package com.lci.rtls.positioning.zone;

/**
 * Tipo de zona definida sobre la planta.
 *
 * <ul>
 *   <li>{@code DANGER}     — zona crítica, alarma fuerte al entrar.</li>
 *   <li>{@code RESTRICTED} — solo personal autorizado, alarma si no permitido.</li>
 *   <li>{@code WARNING}    — zona de precaución, aviso suave.</li>
 *   <li>{@code SAFE}       — refugio / punto de reunión, sin alarma (informativa).</li>
 *   <li>{@code INFO}       — POI puramente informativo (entradas, ascensores...).</li>
 * </ul>
 */
public enum ZoneType {
    DANGER,
    RESTRICTED,
    WARNING,
    SAFE,
    INFO
}
