package com.lci.rtls.positioning.mqtt.model;

/**
 * Coordenadas 3D en metros, en el sistema del modelo IFC/XKT de la planta.
 */
public record Position3D(double x, double y, double z) {
}
