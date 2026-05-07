package com.lci.rtls.positioning.zone;

/**
 * Tipo de primitiva con el que se creó/edita una zona en el editor 3D.
 *
 * <p>Es solo metadata — la geometría canónica almacenada es
 * {@code polygon_2d + zMin/zMax}. El editor del frontend usa
 * {@code shape_type} para recrear el manipulador correcto:
 *
 * <ul>
 *   <li>{@code POLYGON}: polígono libre dibujado click-a-click top-down.</li>
 *   <li>{@code BOX}: cubo (caja AABB) — polígono almacenado con 4 vértices.</li>
 *   <li>{@code CYLINDER}: cilindro (radio + altura) — polígono almacenado
 *       con N segmentos aproximando el círculo.</li>
 * </ul>
 */
public enum ShapeType {
    POLYGON,
    BOX,
    CYLINDER
}
