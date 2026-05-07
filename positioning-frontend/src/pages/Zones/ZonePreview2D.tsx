// Preview SVG top-down de una zona en su contexto: muestra el AABB del
// modelo como un rectángulo guía, otras zonas activas en gris, y la zona
// en edición con su polígono + buffer de approach. BOX y CYLINDER se
// pueden arrastrar (click + drag) para reposicionar centerX/centerZ.
//
// Es un sustituto pragmático de los gizmos 3D — el usuario tiene feedback
// visual y reposiciona rápido sin necesidad de calcular coords mundiales
// a mano. Los gizmos 3D auténticos vienen como mejora futura (#40b).
import { useRef, useState, useEffect, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { SafetyZone, ShapeType } from '../../types/zones';

interface Props {
  /** AABB del modelo {minX, maxX, minZ, maxZ} en coords mundiales. */
  modelAabb: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  /** Zonas existentes (renderizan en gris como contexto). */
  otherZones: SafetyZone[];
  /** Zona en edición — polígono actual. */
  draftPolygon: [number, number][];
  draftColor: string;
  draftBufferM: number;
  /** Si shape es BOX/CYLINDER y el usuario arrastra, devuelve nuevo center. */
  shapeType: ShapeType;
  onDragCenter?: (centerX: number, centerZ: number) => void;
}

const PADDING = 20;
const SVG_W = 480;
const SVG_H = 360;

export function ZonePreview2D({
  modelAabb,
  otherZones,
  draftPolygon,
  draftColor,
  draftBufferM,
  shapeType,
  onDragCenter,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  // Viewport: SIEMPRE atado al AABB del modelo (con un 15% de margen). Las
  // zonas con coords inválidas (creadas antes de V7 bbox, etc.) caen fuera
  // del viewport y no lo deforman — el SVG las recorta naturalmente.
  // Si por algún motivo no hay modelAabb, fallback al draftPolygon o a
  // un viewport por defecto.
  const viewport = useMemo(() => {
    if (modelAabb) {
      const w = modelAabb.maxX - modelAabb.minX;
      const h = modelAabb.maxZ - modelAabb.minZ;
      const m = Math.max(w, h) * 0.15;
      return {
        minX: modelAabb.minX - m, maxX: modelAabb.maxX + m,
        minZ: modelAabb.minZ - m, maxZ: modelAabb.maxZ + m,
      };
    }
    if (draftPolygon.length >= 3) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of draftPolygon) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const m = Math.max(maxX - minX, maxZ - minZ) * 0.5 || 50;
      return { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
    }
    return { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  }, [modelAabb, draftPolygon]);

  const worldW = viewport.maxX - viewport.minX;
  const worldH = viewport.maxZ - viewport.minZ;
  const innerW = SVG_W - PADDING * 2;
  const innerH = SVG_H - PADDING * 2;
  const scale = Math.min(innerW / worldW, innerH / worldH);

  const toScreen = (x: number, z: number): [number, number] => {
    const sx = PADDING + (x - viewport.minX) * scale;
    // Y SVG va hacia abajo; Z mundo va hacia "delante". Para mantener la
    // perspectiva top-down clásica, invertimos.
    const sy = PADDING + (viewport.maxZ - z) * scale;
    return [sx, sy];
  };

  const fromScreen = (sx: number, sy: number): [number, number] => {
    const x = viewport.minX + (sx - PADDING) / scale;
    const z = viewport.maxZ - (sy - PADDING) / scale;
    return [x, z];
  };

  const polygonToPathD = (poly: [number, number][]): string => {
    if (poly.length < 3) return '';
    return poly.map(([x, z], i) => {
      const [sx, sy] = toScreen(x, z);
      return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
    }).join(' ') + ' Z';
  };

  // Centro y bounding box del draft para calcular dónde dibujar el cursor
  // de drag.
  const draftCenter = useMemo(() => {
    if (draftPolygon.length === 0) return null;
    let cx = 0, cz = 0;
    for (const [x, z] of draftPolygon) { cx += x; cz += z; }
    return [cx / draftPolygon.length, cz / draftPolygon.length] as [number, number];
  }, [draftPolygon]);

  // Buffer de approach — polígono inflado (offset uniforme aproximado:
  // expandimos hacia afuera la distancia desde el centro). Solo a efecto
  // visual; el cálculo real es del backend.
  const bufferPolygon = useMemo<[number, number][]>(() => {
    if (!draftCenter || draftBufferM <= 0) return [];
    const [cx, cz] = draftCenter;
    return draftPolygon.map(([x, z]) => {
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d === 0) return [x, z];
      const f = (d + draftBufferM) / d;
      return [cx + dx * f, cz + dz * f];
    });
  }, [draftPolygon, draftCenter, draftBufferM]);

  // Drag handling — solo BOX/CYLINDER (POLYGON tiene N vértices, mover
  // solo el centro lo desformaría).
  const canDrag = (shapeType === 'BOX' || shapeType === 'CYLINDER') && !!onDragCenter;
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canDrag) return;
    setDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging || !canDrag || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wz] = fromScreen(sx, sy);
    onDragCenter?.(wx, wz);
  };
  const handlePointerUp = () => setDragging(false);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Vista top-down · {canDrag ? 'arrastra para reposicionar' : 'edita coords manualmente'}
      </Typography>
      <Box sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: '#1a1f2c',
        position: 'relative',
        cursor: canDrag ? (dragging ? 'grabbing' : 'grab') : 'default',
      }}>
        <svg
          ref={svgRef}
          width={SVG_W}
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: 'block', overflow: 'hidden' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Grid de fondo */}
          <defs>
            <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={SVG_W} height={SVG_H} fill="url(#grid-pattern)" />

          {/* AABB del modelo como referencia (footprint top-down). */}
          {modelAabb && (() => {
            const [x1, y1] = toScreen(modelAabb.minX, modelAabb.maxZ);
            const [x2, y2] = toScreen(modelAabb.maxX, modelAabb.minZ);
            return (
              <g>
                <rect
                  x={x1} y={y1} width={x2 - x1} height={y2 - y1}
                  fill="rgba(91, 155, 213, 0.12)"
                  stroke="rgba(91, 155, 213, 0.85)"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                <text
                  x={x1 + 6}
                  y={y1 + 14}
                  fill="rgba(91, 155, 213, 0.85)"
                  fontSize="10"
                  fontFamily="-apple-system, sans-serif"
                >
                  Modelo
                </text>
              </g>
            );
          })()}

          {/* Otras zonas en gris */}
          {otherZones.map((z) => (
            <path
              key={z.id}
              d={polygonToPathD(z.polygon2d)}
              fill="rgba(160,160,180,0.10)"
              stroke="rgba(200,200,220,0.45)"
              strokeWidth="1"
            />
          ))}

          {/* Buffer del draft (dashed) */}
          {bufferPolygon.length >= 3 && (
            <path
              d={polygonToPathD(bufferPolygon)}
              fill="none"
              stroke={draftColor}
              strokeWidth="1"
              strokeOpacity="0.55"
              strokeDasharray="3 4"
            />
          )}

          {/* Zona en edición */}
          {draftPolygon.length >= 3 && (
            <path
              d={polygonToPathD(draftPolygon)}
              fill={draftColor}
              fillOpacity="0.22"
              stroke={draftColor}
              strokeWidth="2"
            />
          )}

          {/* Cursor del centro */}
          {canDrag && draftCenter && (() => {
            const [sx, sy] = toScreen(draftCenter[0], draftCenter[1]);
            return (
              <g>
                <circle cx={sx} cy={sy} r="6" fill={draftColor} stroke="white" strokeWidth="2" />
                <circle cx={sx} cy={sy} r="14" fill="none" stroke={draftColor} strokeWidth="1" strokeOpacity="0.6" />
              </g>
            );
          })()}
        </svg>
      </Box>
    </Box>
  );
}

export default ZonePreview2D;
