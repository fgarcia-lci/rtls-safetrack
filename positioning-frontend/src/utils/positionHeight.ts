// Helpers para presentar la altura del operario respecto al suelo del
// modelo. Las posiciones del ingest usan convención (x, y, z) donde Z es
// la altura. El modelo xeokit usa Y-up; el `bbox` del plant_view viene
// como JSON con formato `[xmin, ymin, zmin, xmax, ymax, zmax]` (xeokit),
// por lo que la altura del suelo del modelo equivale al campo `ymin`
// (índice 1) del bbox.
//
// `floorHeightM(plantView, z)` devuelve la altura del operario sobre ese
// suelo (en metros), o `null` si no puede calcularse (sin bbox).

interface PlantViewBboxHolder {
  bbox?: string | null;
  /** Offset Y aplicado al modelo desde calibración admin. */
  defaultYOffset?: number | null;
}

function parseBbox(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length >= 6 && arr.every((n) => typeof n === 'number')) {
      return arr as number[];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Altura del suelo de la fábrica (en unidades del modelo XKT). Es
 * `bbox.ymin + defaultYOffset` — el mismo valor que ve el admin como
 * "Suelo del modelo: X m" en el editor de zonas tras aplicar la
 * calibración. Si admin baja el modelo 6 m con yOffset = -6, el suelo
 * efectivo de la fábrica baja también esos 6 m.
 *
 * Devuelve null si no hay bbox parseable.
 */
export function floorY(plantView: PlantViewBboxHolder | null | undefined): number | null {
  if (!plantView) return null;
  const bbox = parseBbox(plantView.bbox);
  if (!bbox) return null;
  const offset = typeof plantView.defaultYOffset === 'number' ? plantView.defaultYOffset : 0;
  return bbox[1] + offset;
}

/**
 * Altura del operario sobre el suelo del modelo, en metros.
 *
 * @param z coordenada vertical del operario (campo `z` del PositionSnapshot).
 *          En el modelo RTLS Z es la altura; en xeokit equivale a Y.
 */
export function floorHeightM(
  plantView: PlantViewBboxHolder | null | undefined,
  z: number,
): number | null {
  const floor = floorY(plantView);
  if (floor === null) return null;
  return z - floor;
}

/** Formato corto para mostrar la altura — "1.7 m" o "−0.3 m". */
export function formatHeight(h: number): string {
  const sign = h < 0 ? '−' : '';
  return `${sign}${Math.abs(h).toFixed(1)} m`;
}
