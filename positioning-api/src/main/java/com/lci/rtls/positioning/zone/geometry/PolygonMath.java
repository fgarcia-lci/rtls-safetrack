package com.lci.rtls.positioning.zone.geometry;

import java.util.List;

/**
 * Utilidades geométricas 2D para evaluar zonas — punto-en-polígono y
 * distancia mínima de un punto a la frontera de un polígono.
 *
 * <p>El polígono se representa como {@code List<List<Double>>} donde cada
 * vértice es {@code [x, y]} (top-down, mismas coords que las posiciones de
 * los tags). Polígono cerrado por convención (no se repite el primer
 * vértice como último — el algoritmo lo cierra implícitamente).
 */
public final class PolygonMath {

    private PolygonMath() {}

    /**
     * Ray casting: cuenta cuántas veces una semirrecta horizontal desde el
     * punto cruza las aristas. Impar = dentro, par = fuera.
     */
    public static boolean pointInPolygon(double x, double y, List<List<Double>> polygon) {
        if (polygon == null || polygon.size() < 3) return false;
        boolean inside = false;
        int n = polygon.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = polygon.get(i).get(0);
            double yi = polygon.get(i).get(1);
            double xj = polygon.get(j).get(0);
            double yj = polygon.get(j).get(1);
            boolean intersect = ((yi > y) != (yj > y))
                    && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Distancia mínima del punto {@code (x, y)} a la frontera del polígono
     * (cualquier arista). Devuelve 0 si el punto está dentro o sobre el
     * borde. Útil para calcular {@code proximity_factor} cuando el punto
     * está fuera pero cerca.
     */
    public static double distanceToPolygonBoundary(double x, double y, List<List<Double>> polygon) {
        if (polygon == null || polygon.size() < 2) return Double.POSITIVE_INFINITY;
        double min = Double.POSITIVE_INFINITY;
        int n = polygon.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double xi = polygon.get(i).get(0);
            double yi = polygon.get(i).get(1);
            double xj = polygon.get(j).get(0);
            double yj = polygon.get(j).get(1);
            double d = distancePointToSegment(x, y, xi, yi, xj, yj);
            if (d < min) min = d;
        }
        return min;
    }

    /** Distancia de un punto a un segmento (no a la línea infinita). */
    private static double distancePointToSegment(double px, double py,
                                                 double ax, double ay,
                                                 double bx, double by) {
        double dx = bx - ax;
        double dy = by - ay;
        double lenSq = dx * dx + dy * dy;
        if (lenSq == 0.0) {
            // Segmento degenerado a punto.
            double ex = px - ax;
            double ey = py - ay;
            return Math.sqrt(ex * ex + ey * ey);
        }
        double t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0.0, Math.min(1.0, t));
        double cx = ax + t * dx;
        double cy = ay + t * dy;
        double ex = px - cx;
        double ey = py - cy;
        return Math.sqrt(ex * ex + ey * ey);
    }
}
