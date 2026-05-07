import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { usePositionsStream } from '../../hooks/usePositionsStream';
import type { Quality } from '../../types/positions';

interface Props {
  plantId: string;
  onAvatarClick?: (tagId: string) => void;
}

const QUALITY_COLOR: Record<Quality, string> = {
  GOOD: '#3cba2e',
  DEGRADED: '#f1b410',
  BAD: '#e23838',
};

const AVATAR_RADIUS = 0.5;   // unidades del modelo (m)
const PADDING = 5;           // m alrededor de los tags para que el SVG no recorte

interface BBox {
  minX: number; minY: number; maxX: number; maxY: number;
}

export function PositioningViewer2D({ plantId, onAvatarClick }: Props) {
  const { tagIds, getInterpolated, getLast } = usePositionsStream(plantId);

  const svgRef = useRef<SVGSVGElement>(null);
  const circlesRef = useRef<Map<string, SVGCircleElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const bboxRef = useRef<BBox | null>(null);

  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [, setTick] = useState(0);   // para forzar re-render cuando cambia tagIds

  // Cuando cambia la lista de tags, forzamos un re-render para añadir/quitar <circle>
  useEffect(() => {
    setTick((x) => x + 1);
  }, [tagIds]);

  // Animation loop: actualizar cx, cy y bbox dinámica.
  useEffect(() => {
    const tick = () => {
      let bbox: BBox | null = null;
      for (const tagId of tagIds) {
        const interp = getInterpolated(tagId);
        if (!interp) continue;
        const circle = circlesRef.current.get(tagId);
        if (circle) {
          circle.setAttribute('cx', String(interp.x));
          circle.setAttribute('cy', String(interp.y));
          circle.setAttribute('fill', QUALITY_COLOR[interp.quality]);
        }
        if (!bbox) {
          bbox = { minX: interp.x, minY: interp.y, maxX: interp.x, maxY: interp.y };
        } else {
          bbox.minX = Math.min(bbox.minX, interp.x);
          bbox.minY = Math.min(bbox.minY, interp.y);
          bbox.maxX = Math.max(bbox.maxX, interp.x);
          bbox.maxY = Math.max(bbox.maxY, interp.y);
        }
      }

      // Actualizar viewBox del SVG si cambió el bbox sustancialmente
      if (bbox && svgRef.current) {
        const w = bbox.maxX - bbox.minX + 2 * PADDING;
        const h = bbox.maxY - bbox.minY + 2 * PADDING;
        const vbX = bbox.minX - PADDING;
        const vbY = bbox.minY - PADDING;
        const prev = bboxRef.current;
        if (
          !prev
          || Math.abs(prev.minX - bbox.minX) > 1
          || Math.abs(prev.minY - bbox.minY) > 1
          || Math.abs(prev.maxX - bbox.maxX) > 1
          || Math.abs(prev.maxY - bbox.maxY) > 1
        ) {
          svgRef.current.setAttribute('viewBox', `${vbX} ${vbY} ${w} ${h}`);
          bboxRef.current = bbox;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tagIds, getInterpolated]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: 'background.default' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        {/* Grid sutil */}
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#e0e0e0" strokeWidth="0.05" />
          </pattern>
        </defs>
        <rect x="-1000" y="-1000" width="2000" height="2000" fill="url(#grid)" />

        {/* Avatares: 1 círculo por tag */}
        {tagIds.map((tagId) => {
          const last = getLast(tagId);
          if (!last) return null;
          return (
            <g key={tagId} onClick={() => onAvatarClick?.(tagId)} style={{ cursor: 'pointer' }}>
              <circle
                ref={(el) => {
                  if (el) circlesRef.current.set(tagId, el);
                  else circlesRef.current.delete(tagId);
                }}
                cx={last.x}
                cy={last.y}
                r={AVATAR_RADIUS}
                fill={QUALITY_COLOR[last.quality]}
                stroke="white"
                strokeWidth="0.1"
                onMouseEnter={() => setHoveredTag(tagId)}
                onMouseLeave={() => setHoveredTag(null)}
              />
              {hoveredTag === tagId && (
                <text
                  x={last.x}
                  y={last.y - AVATAR_RADIUS - 0.3}
                  fontSize="0.8"
                  textAnchor="middle"
                  fill="black"
                  pointerEvents="none"
                >
                  {tagId}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Cuando aún no hay tags, ayuda visual */}
      {tagIds.length === 0 && (
        <Paper
          sx={{
            position: 'absolute', top: 16, left: 16, p: 2,
            bgcolor: 'background.paper', opacity: 0.9,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Esperando datos del simulador…
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

export default PositioningViewer2D;
