/**
 * Helpers para convertir las primitivas (BOX/CYLINDER/POLYGON) del editor
 * a la representación canónica que persiste el backend: polygon_2d como
 * array de [x,y] en coords mundiales + zMin/zMax.
 *
 * - BOX: 4 vértices (rectángulo AABB en XY).
 * - CYLINDER: N segmentos aproximando un círculo.
 * - POLYGON: pasa tal cual.
 *
 * También helpers inversos para reconstruir centro/radio/dimensiones desde
 * un polygon_2d existente cuando el editor abre una zona ya guardada
 * (mira shapeType para saber qué reconstruir).
 */
import type { ShapeType } from '../../types/zones';

const CYLINDER_SEGMENTS = 24;

export interface BoxParams {
  centerX: number;
  centerZ: number;
  sizeX: number;  // ancho en X (m)
  sizeZ: number;  // profundo en Z (m)
  /** Rotación alrededor del eje Y (vertical), en grados. 0 = alineado a ejes
   *  mundo, positivo = sentido antihorario visto desde arriba. */
  rotationDeg?: number;
}

export interface CylinderParams {
  centerX: number;
  centerZ: number;
  radius: number; // radio (m)
}

export function boxToPolygon(b: BoxParams): [number, number][] {
  const hx = b.sizeX / 2;
  const hz = b.sizeZ / 2;
  const theta = ((b.rotationDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // Local corners (sin rotar) → rotar → trasladar a center.
  const local: [number, number][] = [
    [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz],
  ];
  return local.map(([lx, lz]) => [
    b.centerX + lx * c - lz * s,
    b.centerZ + lx * s + lz * c,
  ]);
}

export function cylinderToPolygon(c: CylinderParams, segments = CYLINDER_SEGMENTS): [number, number][] {
  const verts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push([
      c.centerX + Math.cos(angle) * c.radius,
      c.centerZ + Math.sin(angle) * c.radius,
    ]);
  }
  return verts;
}

/** Reconstruye los parámetros de un BOX a partir de su polygon_2d. Soporta
 *  rotación: extrae centro como promedio de vértices, ángulo desde la
 *  primera arista (vértice 0 → 1), y dimensiones desde las longitudes de
 *  las aristas adyacentes. */
export function polygonToBox(polygon: [number, number][]): BoxParams {
  if (polygon.length !== 4) {
    // Fallback al método AABB cuando el polígono no es exactamente un quad.
    const xs = polygon.map((p) => p[0]);
    const zs = polygon.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    return {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      sizeX: maxX - minX,
      sizeZ: maxZ - minZ,
      rotationDeg: 0,
    };
  }
  // Centro = promedio.
  const cx = (polygon[0][0] + polygon[1][0] + polygon[2][0] + polygon[3][0]) / 4;
  const cz = (polygon[0][1] + polygon[1][1] + polygon[2][1] + polygon[3][1]) / 4;
  // Lado X = vértice 0 → 1 (en boxToPolygon era el lado de longitud sizeX).
  const dx01 = polygon[1][0] - polygon[0][0];
  const dz01 = polygon[1][1] - polygon[0][1];
  const sizeX = Math.hypot(dx01, dz01);
  // Lado Z = vértice 1 → 2 (longitud sizeZ).
  const dx12 = polygon[2][0] - polygon[1][0];
  const dz12 = polygon[2][1] - polygon[1][1];
  const sizeZ = Math.hypot(dx12, dz12);
  // Rotación = ángulo del lado X respecto al eje X mundial.
  const theta = Math.atan2(dz01, dx01);
  return {
    centerX: cx,
    centerZ: cz,
    sizeX,
    sizeZ,
    rotationDeg: (theta * 180) / Math.PI,
  };
}

/** Reconstruye los parámetros de un CYLINDER aproximado (asumiendo polygon
 *  con N vértices en círculo). */
export function polygonToCylinder(polygon: [number, number][]): CylinderParams {
  // Centro = promedio de vértices.
  let cx = 0, cz = 0;
  for (const [x, z] of polygon) { cx += x; cz += z; }
  cx /= polygon.length;
  cz /= polygon.length;
  // Radio = distancia media al centro.
  let r = 0;
  for (const [x, z] of polygon) {
    r += Math.hypot(x - cx, z - cz);
  }
  r /= polygon.length;
  return { centerX: cx, centerZ: cz, radius: r };
}

/** Convierte el shape type + parámetros a la representación canónica. */
export function shapeParamsToPolygon(
  shapeType: ShapeType,
  params: BoxParams | CylinderParams | { polygon: [number, number][] },
): [number, number][] {
  if (shapeType === 'BOX') return boxToPolygon(params as BoxParams);
  if (shapeType === 'CYLINDER') return cylinderToPolygon(params as CylinderParams);
  return (params as { polygon: [number, number][] }).polygon;
}

/** Normaliza un ángulo en grados al rango [-180, 180]. */
export function normalizeDeg(deg: number): number {
  let n = deg % 360;
  if (n > 180) n -= 360;
  else if (n < -180) n += 360;
  return n;
}
