import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { usePositionsStream } from '../../hooks/usePositionsStream';
import { proximityStream } from '../../services/proximityStream';
import { zoneService } from '../../services/zoneService';
import { plantViewService } from '../../services/plantViewService';
import { zoneFillCss } from '../../utils/zoneColors';
import { floorHeightM, formatHeight } from '../../utils/positionHeight';
import type { Quality } from '../../types/positions';
import type { SafetyZone } from '../../types/zones';
import type { PlantView } from './types';

interface Props {
  plantId: string;
  /** Necesario para calcular la altura sobre el suelo del modelo. */
  plantView?: PlantView | null;
  onAvatarClick?: (tagId: string) => void;
  onZoneClick?: (zone: SafetyZone) => void;
  /** tagSerials con SOS activo — se pinta "SOS" parpadeante encima. */
  sosActiveTagIds?: Set<string>;
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

export function PositioningViewer2D({ plantId, plantView, onAvatarClick, onZoneClick, sosActiveTagIds }: Props) {
  const { tagIds, getInterpolated, getLast } = usePositionsStream(plantId);

  // Inyecta una vez las keyframes del parpadeo SOS en el SVG 2D. Misma
  // técnica que en el visor 3D pero animación que solo toca opacity
  // (los <g> SVG con transform="translate(...)" se rompen si los toca
  // la animación).
  useEffect(() => {
    const id = 'rtls-sos-2d-blink-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes rtls-sos-2d-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      .rtls-sos-2d-blink { animation: rtls-sos-2d-blink 0.7s ease-in-out infinite; }
    `;
    document.head.appendChild(style);
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);
  const circlesRef = useRef<Map<string, SVGCircleElement>>(new Map());
  const zonePolygonsRef = useRef<Map<number, SVGPolygonElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const bboxRef = useRef<BBox | null>(null);

  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<number | null>(null);
  const [zones, setZones] = useState<SafetyZone[]>([]);
  const [floorplan, setFloorplan] = useState<{
    svg: string;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    flipY: boolean;
  } | null>(null);
  const [, setTick] = useState(0);

  // Carga inicial de zonas activas. Suscripción al proximityStream para
  // que los colores escalen en vivo (mismo patrón que el visor 3D).
  useEffect(() => {
    proximityStream.setPlant(plantId);
    let cancelled = false;
    zoneService.listByPlant(plantId, true).then((zs) => {
      if (cancelled) return;
      setZones(zs);
    }).catch((err) => console.error('[2D] zones error', err));
    return () => { cancelled = true; };
  }, [plantId]);

  // Carga el FLOORPLAN_2D activo de la planta (si lo hay) y descarga su SVG
  // para pintarlo como fondo. El SVG está en coordenadas mundo (metros);
  // si svgFlipY=true (export CAD Y-up), aplicamos transform al renderizarlo.
  useEffect(() => {
    let cancelled = false;
    plantViewService.listForPlant(plantId)
      .then((views) => {
        const fp = views.find((v) => v.type === 'FLOORPLAN_2D');
        if (!fp || fp.worldBboxMinX == null) {
          setFloorplan(null);
          return null;
        }
        return fetch(plantViewService.assetUrl(fp.id), { credentials: 'include' })
          .then((res) => res.ok ? res.text() : Promise.reject(new Error('asset fetch failed')))
          .then((svg) => {
            if (cancelled) return;
            setFloorplan({
              svg: extractSvgInner(svg),
              bbox: {
                minX: fp.worldBboxMinX!,
                minY: fp.worldBboxMinY!,
                maxX: fp.worldBboxMaxX!,
                maxY: fp.worldBboxMaxY!,
              },
              flipY: fp.svgFlipY ?? true,
            });
          });
      })
      .catch((err) => console.error('[2D] floorplan error', err));
    return () => { cancelled = true; };
  }, [plantId]);

  // Re-render cuando cambia tagIds (añadir/quitar circles)
  useEffect(() => {
    setTick((x) => x + 1);
  }, [tagIds]);

  // Animation loop: actualizar avatares + colores de zonas + bbox.
  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      let bbox: BBox | null = null;

      // ---- Avatares ----
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

      // ---- Colores de zonas según proximity_factor ----
      for (const zone of zones) {
        const poly = zonePolygonsRef.current.get(zone.id);
        if (!poly) continue;
        const factor = proximityStream.factorByZone(zone.id);
        // Fill semi-translúcido (la zona es área, no punto). Stroke
        // sólido más oscuro para definir contorno.
        poly.setAttribute('fill', zoneFillCss(zone.displayColor, factor, now, 0.30));
        poly.setAttribute('stroke', zoneFillCss(zone.displayColor, factor, now, 0.95));
      }

      // Extender bbox para incluir las zonas (vista por defecto).
      for (const z of zones) {
        for (const [px, py] of z.polygon2d) {
          if (!bbox) {
            bbox = { minX: px, minY: py, maxX: px, maxY: py };
          } else {
            bbox.minX = Math.min(bbox.minX, px);
            bbox.minY = Math.min(bbox.minY, py);
            bbox.maxX = Math.max(bbox.maxX, px);
            bbox.maxY = Math.max(bbox.maxY, py);
          }
        }
      }

      // Extender bbox para incluir el plano 2D — así al cargar la página
      // sin tags activos y sin zonas, el plano se ve igualmente.
      if (floorplan) {
        const fb = floorplan.bbox;
        if (!bbox) {
          bbox = { minX: fb.minX, minY: fb.minY, maxX: fb.maxX, maxY: fb.maxY };
        } else {
          bbox.minX = Math.min(bbox.minX, fb.minX);
          bbox.minY = Math.min(bbox.minY, fb.minY);
          bbox.maxX = Math.max(bbox.maxX, fb.maxX);
          bbox.maxY = Math.max(bbox.maxY, fb.maxY);
        }
      }

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
  }, [tagIds, getInterpolated, zones, floorplan]);

  // Pre-calcula el `points="x,y x,y..."` de cada zona (no cambia tras
  // cargar; solo color/factor cambian en el tick).
  const zonePointsByZoneId = useMemo(() => {
    const m = new Map<number, string>();
    for (const z of zones) {
      m.set(z.id, z.polygon2d.map(([x, y]) => `${x},${y}`).join(' '));
    }
    return m;
  }, [zones]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#f7f7f7' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            {/* Relleno del cuadrito: tierra clara / crema semi-transparente.
                Sensación de "suelo industrial" y al mismo tiempo deja pasar
                el floorplan SVG cuando esté detrás. */}
            <rect width="5" height="5" fill="#d4c5a0" fillOpacity="0.6" />
            {/* Líneas marrones tierra para que la cuadrícula sobresalga sobre
                el relleno crema. */}
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#8a724a" strokeOpacity="0.7" strokeWidth="0.08" />
          </pattern>
        </defs>
        <rect x="-1000" y="-1000" width="2000" height="2000" fill="url(#grid)" />

        {/* Floorplan 2D — fondo en coords mundo. flipY=true convierte el
            eje Y de CAD (up) a SVG (down) reflejando alrededor del centro
            vertical del bbox. */}
        {floorplan && (
          <g
            transform={
              floorplan.flipY
                ? `translate(0 ${floorplan.bbox.maxY + floorplan.bbox.minY}) scale(1 -1)`
                : undefined
            }
            opacity={0.75}
            dangerouslySetInnerHTML={{ __html: floorplan.svg }}
          />
        )}

        {/* Zonas — debajo de los avatares para no taparlos. */}
        {zones.map((zone) => (
          <g
            key={`zone-${zone.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onZoneClick?.(zone);
            }}
            onMouseEnter={() => setHoveredZoneId(zone.id)}
            onMouseLeave={() => setHoveredZoneId(null)}
            style={{ cursor: onZoneClick ? 'pointer' : 'default' }}
          >
            <polygon
              ref={(el) => {
                if (el) zonePolygonsRef.current.set(zone.id, el);
                else zonePolygonsRef.current.delete(zone.id);
              }}
              points={zonePointsByZoneId.get(zone.id) ?? ''}
              fill={zoneFillCss(zone.displayColor, 0, 0, 0.30)}
              stroke={zoneFillCss(zone.displayColor, 0, 0, 0.95)}
              strokeWidth={hoveredZoneId === zone.id ? 0.4 : 0.2}
            />
            {/* Etiqueta de la zona en el centroide (aproximado: media). */}
            {zone.polygon2d.length > 0 && (
              <text
                x={zone.polygon2d.reduce((s, [x]) => s + x, 0) / zone.polygon2d.length}
                y={zone.polygon2d.reduce((s, [, y]) => s + y, 0) / zone.polygon2d.length}
                fontSize="0.9"
                textAnchor="middle"
                fill="rgba(255,255,255,0.92)"
                stroke="rgba(0,0,0,0.6)"
                strokeWidth="0.05"
                paintOrder="stroke"
                pointerEvents="none"
                style={{ fontWeight: 600 }}
              >
                {zone.name ?? zone.code}
              </text>
            )}
          </g>
        ))}

        {/* Avatares */}
        {tagIds.map((tagId) => {
          const last = getLast(tagId);
          if (!last) return null;
          // Altura del operario sobre el suelo del modelo. En 2D no hay
          // referencia vertical, así que esto resuelve "¿está en planta
          // baja o subido a una pasarela?".
          const h = floorHeightM(plantView, last.z);
          const heightLabel = h !== null ? formatHeight(h) : null;
          return (
            <g
              key={tagId}
              onClick={(e) => {
                e.stopPropagation();
                onAvatarClick?.(tagId);
              }}
              style={{ cursor: 'pointer' }}
            >
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
              {/* Etiqueta "SOS" parpadeante sobre el avatar — solo cuando
                  el operario tiene un SOS activo. Animación CSS aplicada
                  vía className (las keyframes las inyecta el visor 3D al
                  cargarse el módulo en la misma sesión). */}
              {sosActiveTagIds?.has(tagId) && (
                <g pointerEvents="none" className="rtls-sos-2d-blink">
                  <rect
                    x={last.x - 1.0}
                    y={last.y - 2.6}
                    width={2.0}
                    height={1.0}
                    rx={0.2}
                    ry={0.2}
                    fill="#e63939"
                    stroke="#fff"
                    strokeWidth={0.08}
                  />
                  <text
                    x={last.x}
                    y={last.y - 1.85}
                    fontSize="0.75"
                    textAnchor="middle"
                    fill="#fff"
                    style={{ fontWeight: 900, letterSpacing: 0.15 }}
                  >
                    SOS
                  </text>
                </g>
              )}
              {/* Pill con la altura sobre el suelo, a la derecha del
                  círculo. Pequeña y siempre visible. */}
              {heightLabel && (
                <g pointerEvents="none">
                  <rect
                    x={last.x + AVATAR_RADIUS + 0.2}
                    y={last.y - 0.55}
                    width={2.2}
                    height={1.1}
                    rx={0.3}
                    ry={0.3}
                    fill="rgba(255,255,255,0.92)"
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth={0.05}
                  />
                  <text
                    x={last.x + AVATAR_RADIUS + 1.3}
                    y={last.y + 0.25}
                    fontSize="0.75"
                    textAnchor="middle"
                    fill="#222"
                    style={{ fontWeight: 600 }}
                  >
                    {heightLabel}
                  </text>
                </g>
              )}
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

      {tagIds.length === 0 && zones.length === 0 && (
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

/**
 * Returns the inner markup of an SVG document so it can be embedded inside
 * another `<svg>` (with our viewBox in world meters). If the input doesn't
 * have an `<svg>` wrapper it's returned untouched.
 */
function extractSvgInner(svgText: string): string {
  const open = svgText.indexOf('<svg');
  const close = svgText.indexOf('>', open);
  const end = svgText.lastIndexOf('</svg>');
  if (open === -1 || close === -1 || end === -1) return svgText;
  return svgText.substring(close + 1, end);
}

export default PositioningViewer2D;
