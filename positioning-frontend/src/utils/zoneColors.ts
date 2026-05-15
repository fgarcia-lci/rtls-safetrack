// Utilidades de color de zona compartidas entre PositioningViewer2D y
// PositioningViewer3D. La idea: que la lógica de "qué color toca según
// proximity_factor" viva en un solo sitio para que 2D y 3D pinten igual.
//
// Modelo:
//   - factor <= 0  → color base de la zona atenuado (calma)
//   - 0 < factor < 1 → ámbar interpolado (aproximándose)
//   - factor >= 1  → rojo alarma con pulso sinusoidal (~1.5 Hz)

const AMBER_COLOR: [number, number, number] = [1.0, 0.65, 0.10];
const ALARM_COLOR: [number, number, number] = [1.0, 0.15, 0.15];
const DEFAULT_BASE: [number, number, number] = [0.9, 0.25, 0.25];

export function hexToRgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

/**
 * Calcula el color RGB normalizado [0..1] de la zona según factor.
 * Compatible con xeokit (que espera [0..1]).
 */
export function interpolateZoneColor(
  displayColor: string | null | undefined,
  factor: number,
  timeMs: number,
): [number, number, number] {
  if (factor <= 0) {
    const base = hexToRgb(displayColor) ?? DEFAULT_BASE;
    return [base[0] * 0.45, base[1] * 0.45, base[2] * 0.45];
  }
  if (factor >= 1.0) {
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(timeMs * 0.0094));
    return [ALARM_COLOR[0] * pulse, ALARM_COLOR[1] * pulse, ALARM_COLOR[2] * pulse];
  }
  const brightness = 0.5 + 0.5 * factor;
  return [
    AMBER_COLOR[0] * brightness,
    AMBER_COLOR[1] * brightness,
    AMBER_COLOR[2] * brightness,
  ];
}

/** Convierte [0..1] RGB a string CSS `rgb(r, g, b)`. */
export function rgbToCss(rgb: [number, number, number], alpha = 1): string {
  const r = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

/** Atajo: color CSS de una zona dado factor + tiempo. */
export function zoneFillCss(
  displayColor: string | null | undefined,
  factor: number,
  timeMs: number,
  alpha = 1,
): string {
  return rgbToCss(interpolateZoneColor(displayColor, factor, timeMs), alpha);
}
