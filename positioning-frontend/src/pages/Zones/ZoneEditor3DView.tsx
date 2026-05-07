// Visor 3D simplificado para el editor de zonas (#40/#53). Solo carga
// el modelo XKT + rejilla de suelo + cielo CSS y pinta zonas: las
// existentes en gris semi-translúcido y la zona en edición (`draftZone`)
// con su color real. Sin operarios, sin alertas, sin proximity stream —
// el contexto suficiente para que el usuario sepa dónde está colocando
// la zona dentro de la planta.
import { useEffect, useMemo, useRef } from 'react';
import {
  Viewer,
  XKTLoaderPlugin,
  NavCubePlugin,
  Mesh,
  Node,
  ReadableGeometry,
  buildGridGeometry,
  buildCylinderGeometry,
  PhongMaterial,
  math,
} from '@xeokit/xeokit-sdk';
import { Box } from '@mui/material';
import type { PlantView, PlantViewLayer } from '../Live/types';
import type { SafetyZone } from '../../types/zones';

interface DraftZone {
  /** Polígono [x,y] (top-down) en coords mundiales. */
  polygon2d: [number, number][];
  zMin: number;
  zMax: number;
  displayColor: string;
}

interface Props {
  plantView: PlantView | null;
  /** Zonas existentes — se pintan en gris como contexto. */
  otherZones: SafetyZone[];
  /** Zona en edición — se pinta en su color real (refleja form en vivo). */
  draftZone: DraftZone | null;
  /** Callback al cargar el modelo: devuelve el AABB para que el editor
   *  pueda ofrecer defaults razonables. */
  onModelLoaded?: (aabb: number[]) => void;
  /** Click + drag sobre la zona invoca este callback con las nuevas coords
   *  de centro (en el plano horizontal). Si no se pasa, no hay drag. */
  onDragCenter?: (newCenterX: number, newCenterZ: number) => void;
  /** Click + drag sobre la flecha vertical mueve la zona en altura — el
   *  callback recibe el nuevo zMin manteniendo la altura. Si no se pasa,
   *  no se renderiza la flecha. */
  onDragVerticalPosition?: (newZMin: number) => void;
}

const SKY_GRADIENT_CSS =
  'linear-gradient(to bottom, #5A8DAB 0%, #9cc0d8 35%, #cfd6dc 55%, #cfd6dc 72%, #7e8186 100%)';

export function ZoneEditor3DView({ plantView, otherZones, draftZone, onModelLoaded, onDragCenter, onDragVerticalPosition }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navCubeCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const navCubeRef = useRef<NavCubePlugin | null>(null);
  const xktLoaderRef = useRef<XKTLoaderPlugin | null>(null);
  const loadedLayersRef = useRef<Set<string>>(new Set());
  const cameraFramedRef = useRef(false);
  const floorMeshRef = useRef<Mesh | null>(null);
  const modelCenterRef = useRef<[number, number, number] | null>(null);

  // Meshes de zonas — separamos otras (gris) y draft (highlight).
  const otherZoneMeshesRef = useRef<Map<number, Mesh>>(new Map());
  const draftMeshRef = useRef<Mesh | null>(null);
  // Flecha vertical (gizmo Y) — Node con cilindro+cono que se posiciona
  // encima del cubo. Pickable, se arrastra para subir/bajar la zona.
  const yArrowRef = useRef<Node | null>(null);
  const yArrowHandleMeshRef = useRef<Mesh | null>(null);

  // Drag state — guardamos en refs para no recrear el handler de mousemove
  // cada render. dragOffsetX/Z = delta entre el centro de la zona y el
  // punto exacto donde el usuario hizo click → al arrastrar, ese punto
  // queda anclado al cursor (drag natural, no salto al centro).
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<[number, number]>([0, 0]);
  // Mantener una ref con el último callback para que el handler closure
  // no se quede con uno antiguo si el padre lo cambia.
  const onDragCenterRef = useRef(onDragCenter);
  useEffect(() => { onDragCenterRef.current = onDragCenter; }, [onDragCenter]);
  const onDragVerticalPositionRef = useRef(onDragVerticalPosition);
  useEffect(() => { onDragVerticalPositionRef.current = onDragVerticalPosition; }, [onDragVerticalPosition]);
  // Misma idea: si pusiéramos onModelLoaded en deps del effect de layers,
  // cada render del padre (arrow inline) provocaría cleanup → re-mount,
  // y como loadedLayersRef ya tiene el code, no se recarga el modelo y
  // el callback nunca se llama (race con `cancelled`).
  const onModelLoadedRef = useRef(onModelLoaded);
  useEffect(() => { onModelLoadedRef.current = onModelLoaded; }, [onModelLoaded]);
  // Y de la zona (centro vertical) — necesario para resolver el ray-plane.
  const draftYRef = useRef(0);
  // zMin/zMax de la zona — los lee el drag vertical y la creación de flecha.
  const draftZMinRef = useRef(0);
  const draftZMaxRef = useRef(0);
  // Polígono de la zona — se lee del pointerdown para calcular el centro
  // y de ahí el offset de drag.
  const draftPolygonRef = useRef<[number, number][]>([]);
  useEffect(() => {
    if (draftZone) {
      draftYRef.current = (draftZone.zMin + draftZone.zMax) / 2;
      draftZMinRef.current = draftZone.zMin;
      draftZMaxRef.current = draftZone.zMax;
      draftPolygonRef.current = draftZone.polygon2d;
    }
  }, [draftZone]);
  // Modo drag actual: 'xz' (plano horizontal) o 'y' (vertical) o null.
  const dragModeRef = useRef<'xz' | 'y' | null>(null);
  // Para drag vertical: snapshot inicial del cursor + zMin para delta.
  const yDragStartRef = useRef<{ pixelY: number; zMin: number; cameraDist: number } | null>(null);

  const layers = useMemo(() => plantView?.layers ?? [], [plantView]);

  // ---- Crear viewer ----
  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new Viewer({
      canvasElement: canvasRef.current,
      transparent: true,
      logarithmicDepthBufferEnabled: true,
    });
    viewerRef.current = viewer;
    xktLoaderRef.current = new XKTLoaderPlugin(viewer);

    // NavCube en esquina superior derecha — orientación rápida.
    if (navCubeCanvasRef.current) {
      navCubeRef.current = new NavCubePlugin(viewer, {
        canvasElement: navCubeCanvasRef.current,
        visible: true,
        cameraFly: true,
        cameraFitFOV: 45,
        cameraFlyDuration: 0.5,
      });
    }

    // Bloquea la rueda del ratón a la cámara para que no haga scroll de página.
    const canvas = canvasRef.current;
    const wheelHandler = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener('wheel', wheelHandler, { passive: false });

    // Drag interactivo. Click+drag sobre la zona la mueve en el plano
    // horizontal. El cursor queda anclado al punto exacto donde se hizo
    // click → drag natural, no salto al centro. Mientras dragga,
    // deshabilitamos cameraControl para que el orbit no compita.
    //
    // Cómputo del rayo: NDC → inverse(proj) → inverse(view) directamente,
    // sin depender del PickResult de xeokit (poco fiable con prismas
    // translúcidos a coords ~32M + log depth). Detección "click cayó
    // dentro del cubo" mediante point-in-polygon sobre el polígono draft.
    const canvasPosFromEvent = (ev: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [ev.clientX - r.left, ev.clientY - r.top];
    };

    const tmpInvProj = math.mat4();
    const tmpInvView = math.mat4();
    const nearClip = math.vec4();
    const farClip = math.vec4();
    const nearEye = math.vec4();
    const farEye = math.vec4();
    const nearWorld = math.vec4();
    const farWorld = math.vec4();

    const canvasPosToWorldRay = (cx: number, cy: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const ndcX = (2 * cx) / w - 1;
      const ndcY = -((2 * cy) / h - 1);
      math.inverseMat4(viewer.scene.camera.projMatrix, tmpInvProj);
      math.inverseMat4(viewer.scene.camera.viewMatrix, tmpInvView);
      nearClip[0] = ndcX; nearClip[1] = ndcY; nearClip[2] = -1; nearClip[3] = 1;
      farClip[0] = ndcX; farClip[1] = ndcY; farClip[2] = 1; farClip[3] = 1;
      math.transformPoint4(tmpInvProj, nearClip, nearEye);
      math.transformPoint4(tmpInvProj, farClip, farEye);
      for (let i = 0; i < 3; i++) { nearEye[i] /= nearEye[3]; farEye[i] /= farEye[3]; }
      nearEye[3] = 1; farEye[3] = 1;
      math.transformPoint4(tmpInvView, nearEye, nearWorld);
      math.transformPoint4(tmpInvView, farEye, farWorld);
      const dx = farWorld[0] - nearWorld[0];
      const dy = farWorld[1] - nearWorld[1];
      const dz = farWorld[2] - nearWorld[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      return {
        origin: [nearWorld[0], nearWorld[1], nearWorld[2]] as [number, number, number],
        direction: [dx / len, dy / len, dz / len] as [number, number, number],
      };
    };

    const intersectHorizontalPlane = (
      origin: [number, number, number],
      direction: [number, number, number],
      planeY: number,
    ): [number, number] | null => {
      const dy = direction[1];
      if (Math.abs(dy) < 1e-9) return null;
      const t = (planeY - origin[1]) / dy;
      if (t < 0) return null;
      // En xeokit Y-up, el "world Z" es la profundidad horizontal (en
      // RTLS interno la llamamos Y).
      return [origin[0] + t * direction[0], origin[2] + t * direction[2]];
    };

    const pointInPolygon = (px: number, py: number, polygon: [number, number][]): boolean => {
      if (polygon.length < 3) return false;
      let inside = false;
      const n = polygon.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = ((yi > py) !== (yj > py))
          && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };

    /** Proyecta una pos mundial al canvas. Devuelve null si está detrás. */
    const worldToCanvas = (wx: number, wy: number, wz: number): [number, number] | null => {
      const cam = viewer.scene.camera;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const v4 = math.vec4([wx, wy, wz, 1]);
      const view = math.transformPoint4(cam.viewMatrix, v4, math.vec4());
      const clip = math.transformPoint4(cam.projMatrix, view, math.vec4());
      if (clip[3] <= 0) return null;
      const ndcX = clip[0] / clip[3];
      const ndcY = clip[1] / clip[3];
      return [(ndcX + 1) * 0.5 * w, (1 - ndcY) * 0.5 * h];
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const [cx, cy] = canvasPosFromEvent(ev);
      const poly = draftPolygonRef.current;
      if (poly.length === 0) return;
      // Centro del polígono.
      let avgX = 0, avgZ = 0;
      for (const [x, z] of poly) { avgX += x; avgZ += z; }
      avgX /= poly.length; avgZ /= poly.length;

      // ¿Click sobre la flecha vertical? Distancia screen-space al
      // centro de la flecha < threshold.
      if (onDragVerticalPositionRef.current) {
        const arrowTopY = draftZMaxRef.current + ((draftZMaxRef.current - draftZMinRef.current) * 0.5 + 4);
        const arrowScreen = worldToCanvas(avgX, arrowTopY, avgZ);
        if (arrowScreen) {
          const dx = cx - arrowScreen[0];
          const dy = cy - arrowScreen[1];
          if (Math.hypot(dx, dy) < 28) {
            // Modo Y drag.
            const cam = viewer.scene.camera;
            const ex = cam.eye[0] - avgX;
            const ey = cam.eye[1] - draftYRef.current;
            const ez = cam.eye[2] - avgZ;
            const cameraDist = Math.hypot(ex, ey, ez);
            yDragStartRef.current = { pixelY: cy, zMin: draftZMinRef.current, cameraDist };
            dragModeRef.current = 'y';
            draggingRef.current = true;
            try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
            viewer.cameraControl.active = false;
            ev.preventDefault();
            return;
          }
        }
      }

      // Si no, ¿click dentro del polígono? → modo XZ.
      if (!onDragCenterRef.current) return;
      const ray = canvasPosToWorldRay(cx, cy);
      const planeHit = intersectHorizontalPlane(ray.origin, ray.direction, draftYRef.current);
      if (!planeHit) return;
      if (!pointInPolygon(planeHit[0], planeHit[1], poly)) return;
      dragOffsetRef.current = [avgX - planeHit[0], avgZ - planeHit[1]];
      dragModeRef.current = 'xz';
      draggingRef.current = true;
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      viewer.cameraControl.active = false;
      ev.preventDefault();
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const [cx, cy] = canvasPosFromEvent(ev);
      if (dragModeRef.current === 'xz' && onDragCenterRef.current) {
        const ray = canvasPosToWorldRay(cx, cy);
        const planeHit = intersectHorizontalPlane(ray.origin, ray.direction, draftYRef.current);
        if (!planeHit) return;
        const [offX, offZ] = dragOffsetRef.current;
        onDragCenterRef.current(planeHit[0] + offX, planeHit[1] + offZ);
      } else if (dragModeRef.current === 'y' && onDragVerticalPositionRef.current && yDragStartRef.current) {
        const start = yDragStartRef.current;
        // Conversión mouse pixels → world Y a la distancia de la zona.
        // worldHeightAtDist = 2 * dist * tan(fovY/2). En xeokit el
        // FOV está en grados en camera.perspective.fov.
        const cam = viewer.scene.camera;
        // 'perspective.fov' es vertical FOV en grados.
        const perspective = (cam as unknown as { perspective?: { fov?: number } }).perspective;
        const fovDeg = perspective?.fov ?? 60;
        const fovRad = (fovDeg * Math.PI) / 180;
        const worldHeight = 2 * start.cameraDist * Math.tan(fovRad / 2);
        const pixelsPerMeter = canvas.clientHeight / Math.max(1, worldHeight);
        // mouse Y va hacia abajo, world Y va hacia arriba → invertir signo.
        const deltaPixels = cy - start.pixelY;
        const deltaWorldY = -deltaPixels / pixelsPerMeter;
        onDragVerticalPositionRef.current(start.zMin + deltaWorldY);
      }
    };

    const endDrag = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragModeRef.current = null;
      yDragStartRef.current = null;
      try { canvas.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
      viewer.cameraControl.active = true;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      otherZoneMeshesRef.current.clear();
      draftMeshRef.current = null;
      loadedLayersRef.current.clear();
      cameraFramedRef.current = false;
      floorMeshRef.current = null;
      modelCenterRef.current = null;
      try { viewer.destroy(); } catch { /* ignore */ }
      viewerRef.current = null;
      xktLoaderRef.current = null;
      navCubeRef.current = null;
    };
  }, []);

  // ---- Cargar layers XKT ----
  useEffect(() => {
    const viewer = viewerRef.current;
    const loader = xktLoaderRef.current;
    if (!viewer || !loader || layers.length === 0) return;

    let cancelled = false;
    layers.forEach((layer: PlantViewLayer) => {
      if (loadedLayersRef.current.has(layer.code)) return;
      loadedLayersRef.current.add(layer.code);

      const model = loader.load({ id: layer.code, src: layer.assetUrl, edges: true });
      model.on('loaded', () => {
        if (cancelled) return;
        model.visible = layer.defaultVisible;

        // Centro del modelo + rejilla suelo.
        if (!floorMeshRef.current) {
          const aabb = model.aabb;
          const centerX = (aabb[0] + aabb[3]) / 2;
          const centerZ = (aabb[2] + aabb[5]) / 2;
          modelCenterRef.current = [centerX, 0, centerZ];

          const modelMaxSize = Math.max(aabb[3] - aabb[0], aabb[5] - aabb[2]);
          const gridSize = modelMaxSize * 3;
          const divisions = Math.max(20, Math.round(gridSize / 8));
          const floorY = aabb[1];
          const floor = new Mesh(viewer.scene, {
            id: 'rtls-floor-grid',
            origin: [centerX, 0, centerZ],
            geometry: new ReadableGeometry(viewer.scene, buildGridGeometry({
              size: gridSize,
              divisions,
            })),
            material: new PhongMaterial(viewer.scene, {
              color: [0.20, 0.22, 0.24],
              emissive: [0.32, 0.34, 0.37],
            }),
            position: [0, floorY, 0],
            pickable: false,
            collidable: false,
          });
          floorMeshRef.current = floor;

          if (!cameraFramedRef.current) {
            viewer.cameraFlight.jumpTo({ aabb: model.aabb });
            cameraFramedRef.current = true;
          }
          onModelLoadedRef.current?.(Array.from(model.aabb));
        }
      });
    });

    return () => { cancelled = true; };
    // Solo `layers` debe disparar reload — el callback va por ref para
    // evitar el race condition con `cancelled`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  // ---- Pintar otras zonas (existentes) en gris ----
  useEffect(() => {
    const viewer = viewerRef.current;
    const center = modelCenterRef.current;
    if (!viewer || !center) return;

    // Limpiar previos.
    for (const m of otherZoneMeshesRef.current.values()) {
      try { m.destroy(); } catch { /* ignore */ }
    }
    otherZoneMeshesRef.current.clear();

    for (const zone of otherZones) {
      const polygon = zone.polygon2d;
      if (!polygon || polygon.length < 3) continue;
      const mesh = buildPrismMesh(viewer, center, polygon, zone.zMin, zone.zMax,
        `editor-zone-${zone.id}`, [0.55, 0.58, 0.62], 0.18);
      otherZoneMeshesRef.current.set(zone.id, mesh);
    }
    return () => {
      for (const m of otherZoneMeshesRef.current.values()) {
        try { m.destroy(); } catch { /* ignore */ }
      }
      otherZoneMeshesRef.current.clear();
    };
    // Re-run cuando cambian las zonas o cuando el modelo termina de cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherZones, modelCenterRef.current]);

  // ---- Pintar/actualizar draft zone ----
  useEffect(() => {
    const viewer = viewerRef.current;
    const center = modelCenterRef.current;
    if (!viewer || !center) return;

    // Destruir el draft anterior siempre — es más simple que actualizar
    // geometría y al cambiar shape (BOX↔CYLINDER) hace falta re-crear.
    if (draftMeshRef.current) {
      try { draftMeshRef.current.destroy(); } catch { /* ignore */ }
      draftMeshRef.current = null;
    }
    if (yArrowRef.current) {
      try { yArrowRef.current.destroy(); } catch { /* ignore */ }
      yArrowRef.current = null;
      yArrowHandleMeshRef.current = null;
    }
    if (!draftZone || draftZone.polygon2d.length < 3) return;

    const color = hexToRgb(draftZone.displayColor) ?? [1, 0.2, 0.2];
    draftMeshRef.current = buildPrismMesh(
      viewer,
      center,
      draftZone.polygon2d,
      draftZone.zMin,
      draftZone.zMax,
      'editor-zone-draft',
      color,
      0.42,
      // pickable=true → el usuario puede agarrar este prisma con el ratón.
      true,
    );

    // Flecha vertical (gizmo Y) — Node con cilindro+cono que sale del
    // techo del cubo hacia arriba. Se renderiza sobre todo (depthTest
    // implícito normal pero sin clippable). El handler del drag detecta
    // click en pantalla, no usa el pick de xeokit (más fiable).
    if (onDragVerticalPositionRef.current) {
      // Centro horizontal del polígono (local coords).
      let avgX = 0, avgZ = 0;
      for (const [x, z] of draftZone.polygon2d) { avgX += x; avgZ += z; }
      avgX /= draftZone.polygon2d.length;
      avgZ /= draftZone.polygon2d.length;
      const localX = avgX - center[0];
      const localZ = avgZ - center[2];
      const arrowBaseY = draftZone.zMax + 0.5;
      const stickHeight = Math.max(2, (draftZone.zMax - draftZone.zMin) * 0.5);
      const stickRadius = 0.25;
      const headRadius = 0.7;
      const headHeight = 1.5;
      const arrowMat = new PhongMaterial(viewer.scene, {
        diffuse: [0, 0, 0],
        emissive: [1, 0.85, 0.15],   // amarillo
      });
      const node = new Node(viewer.scene, { id: 'editor-y-arrow' });
      // Stick (cilindro vertical).
      new Mesh(node, {
        origin: center,
        geometry: new ReadableGeometry(viewer.scene, buildCylinderGeometry({
          radiusTop: stickRadius,
          radiusBottom: stickRadius,
          height: stickHeight,
          radialSegments: 16,
          heightSegments: 1,
          openEnded: false,
        })),
        material: arrowMat,
        position: [localX, arrowBaseY + stickHeight / 2, localZ],
        pickable: false,
        collidable: false,
      });
      // Cabeza (cono = cilindro con radioTop=0).
      const headBaseY = arrowBaseY + stickHeight;
      yArrowHandleMeshRef.current = new Mesh(node, {
        origin: center,
        geometry: new ReadableGeometry(viewer.scene, buildCylinderGeometry({
          radiusTop: 0.001,
          radiusBottom: headRadius,
          height: headHeight,
          radialSegments: 20,
          heightSegments: 1,
          openEnded: false,
        })),
        material: arrowMat,
        position: [localX, headBaseY + headHeight / 2, localZ],
        pickable: true,
        collidable: false,
      });
      yArrowRef.current = node;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftZone, modelCenterRef.current]);

  return (
    <Box sx={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: SKY_GRADIENT_CSS,
    }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          outline: 'none',
          background: 'transparent',
        }}
      />
      <canvas
        ref={navCubeCanvasRef}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 100,
          height: 100,
          opacity: 0.75,
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      />
    </Box>
  );
}

// Construye un prisma sólido translúcido a partir de polígono + alturas,
// con RTC origin para esquivar el bug de precisión a coords ~32M.
function buildPrismMesh(
  viewer: Viewer,
  center: [number, number, number],
  polygon: [number, number][],
  zMin: number,
  zMax: number,
  meshId: string,
  emissive: [number, number, number],
  alpha: number,
  pickable = false,
): Mesh {
  const n = polygon.length;
  const positions: number[] = [];
  for (const [px, py] of polygon) {
    positions.push(px - center[0], zMin, py - center[2]);
  }
  for (const [px, py] of polygon) {
    positions.push(px - center[0], zMax, py - center[2]);
  }
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    indices.push(i, i2, n + i2, i, n + i2, n + i);
  }
  for (let i = 1; i < n - 1; i++) indices.push(n, n + i, n + i + 1);
  for (let i = 1; i < n - 1; i++) indices.push(0, i + 1, i);

  return new Mesh(viewer.scene, {
    id: meshId,
    origin: center,
    geometry: new ReadableGeometry(viewer.scene, {
      primitive: 'triangles',
      positions,
      indices,
    }),
    material: new PhongMaterial(viewer.scene, {
      diffuse: [0, 0, 0],
      emissive,
      backfaces: true,
      alpha,
      alphaMode: 'blend',
    }),
    pickable,
    collidable: false,
  });
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export default ZoneEditor3DView;
