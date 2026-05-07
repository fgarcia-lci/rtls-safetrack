import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Viewer,
  XKTLoaderPlugin,
  NavCubePlugin,
  Mesh,
  ReadableGeometry,
  buildSphereGeometry,
  buildCylinderGeometry,
  buildGridGeometry,
  PhongMaterial,
  math,
} from '@xeokit/xeokit-sdk';
import { Box, CircularProgress } from '@mui/material';
import { usePositionsStream } from '../../hooks/usePositionsStream';
import { tagService } from '../../services/tagService';
import { zoneService } from '../../services/zoneService';
import { proximityStream } from '../../services/proximityStream';
import type { PlantViewLayer, PlantView } from './types';
import type { Quality } from '../../types/positions';
import type { Tag } from '../../types/tag';
import type { SafetyZone } from '../../types/zones';

interface Props {
  plantId: string;
  plantView: PlantView | null;
  /** Map de visibilidad por código de layer (controlada por el padre). */
  layersVisible: Record<string, boolean>;
  onAvatarClick?: (tagId: string) => void;
  /** Serial del operario seleccionado (panel abierto). null si ninguno. */
  selectedSerial?: string | null;
  /** Serial del operario al que la cámara está siguiendo. null = libre. */
  followingSerial?: string | null;
}

const QUALITY_COLOR: Record<Quality, [number, number, number]> = {
  GOOD: [0.2, 0.85, 0.25],
  DEGRADED: [0.95, 0.75, 0.15],
  BAD: [0.9, 0.2, 0.2],
};

// Versión CSS del color de quality para el círculo del avatar en el label.
const QUALITY_COLOR_CSS: Record<Quality, string> = {
  GOOD: '#34c759',
  DEGRADED: '#f5b91d',
  BAD: '#e63939',
};

// Geometría de la figurita humana — escalada x3 sobre talla real porque
// el modelo es enorme (~99m de alto) y un humano de 1.7m sería un punto.
// Cartoon "PoC industrial": visible desde lejos, mantiene proporciones.
// Pies anclados al suelo del modelo (model.aabb[1]) en el tick, no a la
// posición publicada por el simulador (que es altura del pecho).
const BODY_RADIUS = 1.05;   // diámetro 2.1 m
const BODY_HEIGHT = 4.2;    // 4.2 m
const HEAD_RADIUS = 0.96;   // diámetro 1.92 m
// Total altura figura ≈ 4.2 + 2*0.96 = 6.12 m
// Offset Y del label sobre la cabeza (para anclar al hacer projection).
const LABEL_Y_OFFSET = BODY_HEIGHT + HEAD_RADIUS * 2 + 1.2;
// Disco horizontal a los pies del muñequito que emite el "fulgor" rojo
// sobre la superficie donde está parado. Es lo que da la sensación de
// luz que sale del operario sin tener que añadir una PointLight real.
const BASE_DISC_RADIUS = 2.8; // metros
const BASE_DISC_THICKNESS = 0.05;
const AVATAR_PREFIX = 'avatar-';

// Convierte un color hex (#RRGGBB / #RRGGBBAA) a [r, g, b] en [0..1].
function hexToRgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// Color semántico de zona según proximity_factor.
//  - factor == 0:    displayColor base de la zona, atenuado (zona "calma").
//  - 0 < factor < 1: ÁMBAR de aproximación, intensidad proporcional al factor.
//  - factor >= 1:    ROJO alarma + pulso sinusoidal a ~1.5 Hz.
const AMBER_COLOR: [number, number, number] = [1.0, 0.65, 0.10];
const ALARM_COLOR: [number, number, number] = [1.0, 0.15, 0.15];
function interpolateZoneColor(
  displayColor: string | null | undefined,
  factor: number,
  timeMs: number,
): [number, number, number] {
  if (factor <= 0) {
    const base = hexToRgb(displayColor) ?? [0.9, 0.25, 0.25];
    return [base[0] * 0.45, base[1] * 0.45, base[2] * 0.45];
  }
  if (factor >= 1.0) {
    // Pulso 1.5 Hz, brillo entre 0.65 y 1.0.
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(timeMs * 0.0094));
    return [ALARM_COLOR[0] * pulse, ALARM_COLOR[1] * pulse, ALARM_COLOR[2] * pulse];
  }
  // APPROACHING — ámbar con brillo proporcional.
  const brightness = 0.5 + 0.5 * factor;
  return [AMBER_COLOR[0] * brightness, AMBER_COLOR[1] * brightness, AMBER_COLOR[2] * brightness];
}

// Color y opacidad del disco a los pies (el "fulgor" sobre la superficie).
// Más opaco que el aura porque está apoyado y no se ve de canto. Apagado
// cuando el operario está tranquilo, intenso cuando está dentro de zona.
function baseDiscStyle(
  factor: number,
  timeMs: number,
): { emissive: [number, number, number]; alpha: number } {
  if (factor <= 0) {
    return { emissive: [0, 0, 0], alpha: 0 };
  }
  if (factor >= 1.0) {
    const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(timeMs * 0.0094));
    return {
      emissive: [ALARM_COLOR[0] * pulse, ALARM_COLOR[1] * pulse, ALARM_COLOR[2] * pulse],
      alpha: 0.65,
    };
  }
  return {
    emissive: AMBER_COLOR,
    alpha: 0.20 + 0.40 * factor,
  };
}

// Diffuse + emissive del muñequito según quality y proximity:
//  - factor == 0:    diffuse = quality color, emissive tenue (estado normal).
//  - 0 < factor < 1: diffuse=ámbar, emissive ámbar brillante (APPROACHING).
//  - factor >= 1:    diffuse=rojo, emissive rojo pulsante (INSIDE).
function avatarColors(
  quality: Quality,
  factor: number,
  timeMs: number,
): { diffuse: [number, number, number]; emissive: [number, number, number] } {
  if (factor <= 0) {
    const qc = QUALITY_COLOR[quality];
    return {
      diffuse: qc,
      emissive: [qc[0] * 0.30, qc[1] * 0.30, qc[2] * 0.30],
    };
  }
  if (factor >= 1.0) {
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(timeMs * 0.0094));
    return {
      diffuse: ALARM_COLOR,
      emissive: [ALARM_COLOR[0] * pulse, ALARM_COLOR[1] * pulse, ALARM_COLOR[2] * pulse],
    };
  }
  const brightness = 0.5 + 0.5 * factor;
  return {
    diffuse: AMBER_COLOR,
    emissive: [AMBER_COLOR[0] * brightness, AMBER_COLOR[1] * brightness, AMBER_COLOR[2] * brightness],
  };
}

// "Skybox" implementado como linear-gradient CSS detrás del canvas
// transparente, NO como geometría 3D. Probamos cube skybox (esquinas
// visibles del cubo) y sphere skybox (incompatible con coords
// mundiales ~32M + logarithmicDepthBuffer, rompía el render del
// modelo). El gradiente CSS no rota con la cámara pero a escala
// industrial el horizonte real tampoco rota perceptiblemente. Cero
// esquinas, cero precision issues, cero costuras.
const SKY_GRADIENT_CSS =
  'linear-gradient(to bottom, ' +
  '#5A8DAB 0%, ' +
  '#9cc0d8 35%, ' +
  '#cfd6dc 55%, ' +
  '#cfd6dc 72%, ' +
  '#7e8186 100%)';


export function PositioningViewer3D({
  plantId,
  plantView,
  layersVisible,
  onAvatarClick,
  selectedSerial = null,
  followingSerial = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navCubeCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const navCubeRef = useRef<NavCubePlugin | null>(null);
  const xktLoaderRef = useRef<XKTLoaderPlugin | null>(null);
  // tagId → { body, head, baseDisc } — figurita humana + disco horizontal
  // a los pies que emite el "fulgor" rojo sobre la superficie donde está
  // parado (suelo principal o plataformas elevadas). El aura translúcida
  // del cuerpo se quitó porque confundía visualmente.
  const avatarsRef = useRef<Map<string, {
    body: Mesh; head: Mesh; baseDisc: Mesh;
  }>>(new Map());
  // Layers que ya iniciaron carga (cargando o cargadas). Se usa para evitar
  // duplicar `loader.load(...)` cuando el useEffect se vuelve a ejecutar.
  const loadedLayersRef = useRef<Set<string>>(new Set());
  const cameraFramedRef = useRef(false);
  const floorMeshRef = useRef<Mesh | null>(null);
  const rafRef = useRef<number | null>(null);
  // Camera-follow: prop como ref para que el tick siempre use el último valor.
  const followingSerialRef = useRef<string | null>(followingSerial);
  useEffect(() => {
    // Cuando se activa por primera vez, hacer un fly suave; cuando se
    // desactiva, limpiar trail.
    if (followingSerial !== followingSerialRef.current) {
      cameraFlyToFollowRef.current = followingSerial !== null;
      if (followingSerial == null) {
        if (trailMeshRef.current) {
          try { trailMeshRef.current.destroy(); } catch { /* ignore */ }
          trailMeshRef.current = null;
        }
        trailBufferRef.current.clear();
      }
    }
    followingSerialRef.current = followingSerial;
  }, [followingSerial]);
  // Buffer del trail por tag: últimas N posiciones con timestamp para
  // poder filtrar a últimos 30s. Se llena cada tick mientras se sigue.
  const trailBufferRef = useRef<Map<string, { x: number; y: number; z: number; t: number }[]>>(new Map());
  // Mesh de la polyline del trail — se reconstruye cada tick mientras
  // se está siguiendo, se destruye cuando se deja de seguir.
  const trailMeshRef = useRef<Mesh | null>(null);
  // Flag para una transición suave la primera vez que se activa el follow.
  const cameraFlyToFollowRef = useRef(false);
  // Centro del modelo en coords mundiales — necesario para crear los
  // avatares con RTC origin y evitar que se descompongan al mover la
  // cámara (precision loss float32 a coords ~32M).
  const modelCenterRef = useRef<[number, number, number] | null>(null);
  // Suelo del modelo (Y mundial) — los muñequitos plantan los pies aquí
  // en lugar de la altura publicada por el simulador, porque al
  // escalarlos x3 se hundirían bajo el suelo si no.
  const floorYRef = useRef<number | null>(null);
  // DOM refs para los labels (uno por tagId) — actualizamos su transform
  // cada frame con la posición proyectada a pantalla.
  const labelRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  // Meshes de las zonas. Por zona: `fill` = prisma sólido translúcido
  // (paredes que emiten luz). Sin aristas — las paredes solas dan el
  // efecto, las aristas duras desentonaban con la estética.
  const zoneMeshesRef = useRef<Map<number, { fill: Mesh }>>(new Map());
  // Lista de zonas cacheada para acceso rápido desde el tick (sin
  // recreación de la animación cuando cambia el array).
  const zonesRef = useRef<SafetyZone[]>([]);

  const { tagIds, getInterpolated } = usePositionsStream(plantId);

  // Mapping serial → Tag (para mostrar nombre del operario en el label).
  const [tagsBySerial, setTagsBySerial] = useState<Record<string, Tag>>({});
  useEffect(() => {
    let cancelled = false;
    tagService.list({ plantId, size: 200 }).then((page) => {
      if (cancelled) return;
      const map: Record<string, Tag> = {};
      for (const t of page.content) map[t.serial] = t;
      setTagsBySerial(map);
    }).catch((err) => console.error('[3D] fetch tags error:', err));
    return () => { cancelled = true; };
  }, [plantId]);

  // Zonas + suscripción al stream de proximidad. La lista se mantiene en
  // state (re-render para el efecto de creación de meshes); el ref refleja
  // el último valor para acceso desde el tick.
  const [zones, setZones] = useState<SafetyZone[]>([]);
  // Flip a true cuando el modelo XKT termina de cargar — desbloquea la
  // creación de los meshes de zonas (necesitan modelCenterRef ya seteado).
  const [modelReady, setModelReady] = useState(false);
  useEffect(() => {
    proximityStream.setPlant(plantId);
    let cancelled = false;
    zoneService.listByPlant(plantId, true).then((zs) => {
      if (cancelled) return;
      setZones(zs);
      zonesRef.current = zs;
      console.warn('[3D] Zones cargadas:', zs.length);
    }).catch((err) => console.error('[3D] fetch zones error:', err));
    return () => { cancelled = true; };
  }, [plantId]);
  useEffect(() => { zonesRef.current = zones; }, [zones]);

  // Memoize layers list to compare cambio real
  const layers = useMemo(() => plantView?.layers ?? [], [plantView]);

  // ---- Crear viewer una vez ----
  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new Viewer({
      canvasElement: canvasRef.current,
      // transparent:true → detrás del canvas se ve el degradado CSS
      // del Box padre, que actúa como cielo+horizonte virtual.
      transparent: true,
      // El modelo está en coordenadas mundiales reales (~ 32 millones).
      // Sin esto, float32 del depth buffer pierde precisión y los avatares
      // y geometrías cercanas se descomponen al rotar la cámara.
      logarithmicDepthBufferEnabled: true,
    });
    viewerRef.current = viewer;
    xktLoaderRef.current = new XKTLoaderPlugin(viewer);

    // NavCube — cubo de navegación en esquina superior derecha (mismo
    // patrón que el DT). Click en una cara orienta la cámara, click en
    // arista vista isométrica.
    if (navCubeCanvasRef.current) {
      navCubeRef.current = new NavCubePlugin(viewer, {
        canvasElement: navCubeCanvasRef.current,
        visible: true,
        cameraFly: true,
        cameraFitFOV: 45,
        cameraFlyDuration: 0.5,
      });
    }

    // DEBUG: expone el viewer en window para que se pueda inspeccionar desde la consola
    // del browser. Quitar antes de producción.
    (window as unknown as { __rtlsViewer?: Viewer }).__rtlsViewer = viewer;
    console.warn('[3D] Viewer creado. Disponible en window.__rtlsViewer');

    // Click sobre avatar → emitir tagId. Las figuritas tienen 2 meshes
    // (avatar-{tagId}-body, avatar-{tagId}-head); quitar prefijo y
    // sufijo para sacar el tagId limpio.
    viewer.scene.input.on('mouseclicked', (coords: number[]) => {
      const hit = viewer.scene.pick({ canvasPos: coords as [number, number] });
      const id = hit?.entity?.id as string | undefined;
      if (id && typeof id === 'string' && id.startsWith(AVATAR_PREFIX)) {
        const rest = id.substring(AVATAR_PREFIX.length);
        const tagId = rest.replace(/-(body|head)$/, '');
        onAvatarClick?.(tagId);
      }
    });

    // Captura la rueda del ratón sobre el canvas para que xeokit haga
    // zoom y NO se propague al `overflow:auto` del layout principal
    // (cuando se propagaba, mover la rueda hacía scroll de la página
    // y se perdía la vista 3D).
    const canvas = canvasRef.current;
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
    };
    canvas.addEventListener('wheel', wheelHandler, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      avatarsRef.current.clear();
      loadedLayersRef.current.clear();
      cameraFramedRef.current = false;
      floorMeshRef.current = null;
      trailMeshRef.current = null;
      trailBufferRef.current.clear();
      try { viewer.destroy(); } catch { /* viewer may already be destroyed */ }
      viewerRef.current = null;
      xktLoaderRef.current = null;
      navCubeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Cargar/sincronizar layers XKT ----
  // Importante: NO depende de layersVisible (esa visibilidad se aplica en otro
  // useEffect). Si lo metes aquí, cada cambio de visibilidad provoca recargar
  // el modelo entero (107 MB) → RAM explota.
  useEffect(() => {
    const viewer = viewerRef.current;
    const loader = xktLoaderRef.current;
    if (!viewer || !loader || layers.length === 0) return;

    const wanted = new Set(layers.map((l) => l.code));

    // Quitar las que ya no aplican (cambio de plantView)
    for (const code of Array.from(loadedLayersRef.current)) {
      if (!wanted.has(code)) {
        const model = viewer.scene.models[code];
        if (model) model.destroy();
        loadedLayersRef.current.delete(code);
      }
    }

    // Cargar las nuevas. Marcamos en el ref ANTES del load para que un
    // re-render rápido (StrictMode, cambio de layersVisible, etc.) no
    // dispare una segunda carga del mismo XKT.
    let cancelled = false;
    layers.forEach((layer: PlantViewLayer) => {
      if (loadedLayersRef.current.has(layer.code)) return;
      loadedLayersRef.current.add(layer.code);

      console.warn(`[3D] Iniciando carga de layer "${layer.code}" desde ${layer.assetUrl}`);
      const model = loader.load({
        id: layer.code,
        src: layer.assetUrl,
        edges: true,
      });

      model.on('loaded', () => {
        if (cancelled) return;
        model.visible = layer.defaultVisible;
        console.warn(`[3D] Layer "${layer.code}" loaded`);
        console.warn('[3D] model.aabb (minX,minY,minZ,maxX,maxY,maxZ):', Array.from(model.aabb));

        // Rejilla de líneas como suelo de referencia (estilo Blender/Unity).
        // Probamos con plano sólido (Plane y Box, con y sin RTC) y siempre
        // sufre el mismo bug de xeokit a coords mundiales ~32M: los 2
        // triángulos de cada quad se separan en pantalla y uno renderiza
        // como back-face → diagonal negro/color. Las líneas no son
        // triángulos, así que el bug no aplica. Usamos `origin` igualmente
        // por buena práctica (RTC).
        if (!floorMeshRef.current) {
          const aabb = model.aabb;
          const centerX = (aabb[0] + aabb[3]) / 2;
          const centerZ = (aabb[2] + aabb[5]) / 2;
          const modelMaxSize = Math.max(aabb[3] - aabb[0], aabb[5] - aabb[2]);
          // Guardamos el centro del modelo para que el tick de avatares
          // pueda crearlos con RTC origin (mismo truco que la rejilla).
          modelCenterRef.current = [centerX, 0, centerZ];
          floorYRef.current = aabb[1];
          // Rejilla 3x el modelo: el horizonte visible queda lejos y el
          // skybox no se siente "pared cercana".
          const gridSize = modelMaxSize * 3;
          // ~8m por celda → cuadros grandes, sensación de escala industrial
          const divisions = Math.max(20, Math.round(gridSize / 8));
          // Al ras del modelo (no por debajo). Reduce gap visual
          // modelo↔suelo para que no parezca flotando.
          const floorY = aabb[1];
          const floor = new Mesh(viewer.scene, {
            id: 'rtls-floor-grid',
            origin: [centerX, 0, centerZ],
            geometry: new ReadableGeometry(viewer.scene, buildGridGeometry({
              size: gridSize,
              divisions,
            })),
            // Líneas WebGL son siempre 1px (limitación estándar). Para
            // que se perciban más "finas" / sutiles se baja la
            // luminosidad emissive → menos protagonismo visual.
            material: new PhongMaterial(viewer.scene, {
              color: [0.20, 0.22, 0.24],
              emissive: [0.32, 0.34, 0.37],
            }),
            position: [0, floorY, 0],
            pickable: false,
            collidable: false,
          });
          floorMeshRef.current = floor;
          console.warn(
            '[3D] Grid suelo creado. origin=', [centerX, 0, centerZ],
            ' size=', gridSize, ' divisions=', divisions, ' floorY=', floorY,
          );
        }

        // Encuadrar SOLO al modelo, ignorando los avatares.
        if (!cameraFramedRef.current) {
          viewer.cameraFlight.jumpTo({ aabb: model.aabb });
          cameraFramedRef.current = true;
        }

        // Aviso al efecto de zonas que ya puede pintar — modelCenterRef
        // está seteado y el modelo es visible.
        setModelReady(true);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [layers]);

  // ---- Crear / refrescar meshes wireframe de las zonas ----
  // Cada zona se renderiza como un PRISMA WIREFRAME (líneas) — cilindro
  // poligonal: borde inferior + borde superior + aristas verticales en
  // cada vértice. Se elige líneas y no caras para esquivar el bug
  // conocido de xeokit con planos sólidos a coords mundiales ~32M
  // (ver gotcha #16).
  useEffect(() => {
    const viewer = viewerRef.current;
    const center = modelCenterRef.current;
    if (!viewer || !modelReady || !center) return;

    // Limpia meshes anteriores (cambio de plantId, refresh de zonas, etc.).
    for (const pair of zoneMeshesRef.current.values()) {
      try { pair.fill.destroy(); } catch { /* ignore */ }
    }
    zoneMeshesRef.current.clear();

    // Cada zona se renderiza como un PRISMA SÓLIDO translúcido (triángulos
    // manuales, no buildBoxGeometry — el bug del "diagonal split" lo
    // afecta). El emissive define el color "luz" que emiten las paredes.
    // Con RTC origin los vértices van en coords locales pequeñas.
    for (const zone of zones) {
      const polygon = zone.polygon2d;
      if (!polygon || polygon.length < 3) continue;

      const n = polygon.length;
      const positions: number[] = [];
      // Vértices inferiores (0..n-1) y superiores (n..2n-1).
      for (const [px, py] of polygon) {
        positions.push(px - center[0], zone.zMin, py - center[2]);
      }
      for (const [px, py] of polygon) {
        positions.push(px - center[0], zone.zMax, py - center[2]);
      }

      const indices: number[] = [];
      // Caras laterales: para cada arista i→(i+1)%n del polígono,
      // construir un quad como 2 triángulos.
      for (let i = 0; i < n; i++) {
        const i2 = (i + 1) % n;
        const bi = i, bi2 = i2;
        const ti = n + i, ti2 = n + i2;
        indices.push(bi, bi2, ti2, bi, ti2, ti);
      }
      // Cara superior (fan triangulación — asume polígono convexo).
      for (let i = 1; i < n - 1; i++) {
        indices.push(n, n + i, n + i + 1);
      }
      // Cara inferior (winding inverso para que la normal apunte hacia abajo).
      for (let i = 1; i < n - 1; i++) {
        indices.push(0, i + 1, i);
      }

      const initialColor = interpolateZoneColor(zone.displayColor, 0, 0);

      // FILL: prisma sólido translúcido (paredes que emiten luz). Alpha
      // intermedio: se ve la silueta del cubo pero sigue siendo etéreo,
      // sin tapar el modelo detrás.
      const fill = new Mesh(viewer.scene, {
        id: `zone-${zone.id}-fill`,
        origin: center,
        geometry: new ReadableGeometry(viewer.scene, {
          primitive: 'triangles',
          positions,
          indices,
        }),
        material: new PhongMaterial(viewer.scene, {
          diffuse: [0, 0, 0],
          emissive: initialColor,
          // backfaces:true → se ve tanto desde fuera como desde dentro
          // (si la cámara entra al prisma).
          backfaces: true,
          alpha: 0.35,
          alphaMode: 'blend',
        }),
        pickable: false,
        collidable: false,
      });

      zoneMeshesRef.current.set(zone.id, { fill });
    }
    console.warn('[3D] Zone meshes creados:', zoneMeshesRef.current.size);

    return () => {
      for (const pair of zoneMeshesRef.current.values()) {
        try { pair.fill.destroy(); } catch { /* ignore */ }
      }
      zoneMeshesRef.current.clear();
    };
  }, [zones, modelReady]);

  // ---- Aplicar visibility cuando cambia el toggle del padre ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    for (const code of Object.keys(layersVisible)) {
      const model = viewer.scene.models[code];
      if (model) model.visible = layersVisible[code];
    }
  }, [layersVisible]);

  // ---- Animation loop: actualizar avatares + proyectar labels ----
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Buffers reutilizados para no asignar memoria por frame.
    const worldVec4 = math.vec4();
    const viewVec4 = math.vec4();
    const clipVec4 = math.vec4();

    const tick = () => {
      const knownTagIds = new Set(tagIds);
      const center = modelCenterRef.current;

      // Crear avatares nuevos como figuritas humanas (cilindro cuerpo +
      // esfera cabeza). RTC origin = centro del modelo → vértices en
      // coords locales pequeñas, nada de precision loss float32.
      // OJO swap Y↔Z: xeokit es Y-up, el modelo interno RTLS es Z-up.
      // Pies plantados en el SUELO del modelo (floorYRef), no en la
      // altura publicada (que es chest level y desfasaría la figura
      // escalada x3).
      const floorY = floorYRef.current;
      for (const tagId of knownTagIds) {
        if (avatarsRef.current.has(tagId)) continue;
        const interp = getInterpolated(tagId);
        if (!interp || !center || floorY == null) continue;
        const localX = interp.x - center[0];
        const localZ = interp.y - center[2];
        const bodyCenterY = floorY + BODY_HEIGHT / 2;
        const headCenterY = floorY + BODY_HEIGHT + HEAD_RADIUS;
        const color = QUALITY_COLOR[interp.quality];
        const emissive = color.map((c) => c * 0.3) as [number, number, number];
        const body = new Mesh(viewer.scene, {
          id: `${AVATAR_PREFIX}${tagId}-body`,
          origin: center,
          geometry: new ReadableGeometry(viewer.scene, buildCylinderGeometry({
            radiusTop: BODY_RADIUS,
            radiusBottom: BODY_RADIUS,
            height: BODY_HEIGHT,
            radialSegments: 20,
            heightSegments: 1,
            openEnded: false,
          })),
          material: new PhongMaterial(viewer.scene, {
            diffuse: color,
            shininess: 60,
            emissive,
          }),
          position: [localX, bodyCenterY, localZ],
          pickable: true,
        });
        const head = new Mesh(viewer.scene, {
          id: `${AVATAR_PREFIX}${tagId}-head`,
          origin: center,
          geometry: new ReadableGeometry(viewer.scene, buildSphereGeometry({
            radius: HEAD_RADIUS,
            heightSegments: 14,
            widthSegments: 18,
          })),
          material: new PhongMaterial(viewer.scene, {
            diffuse: color,
            shininess: 70,
            emissive,
          }),
          position: [localX, headCenterY, localZ],
          pickable: true,
        });
        // Disco horizontal a los pies — cilindro plano radio 2.8 m,
        // grosor 5 cm. Pegado a la superficie sobre la que está parado
        // el operario (de momento siempre el suelo del modelo, pero
        // soportará plataformas elevadas cuando el simulador publique
        // alturas variables). Apagado por defecto, se ilumina rojo
        // cuando el factor sube.
        const baseDisc = new Mesh(viewer.scene, {
          id: `${AVATAR_PREFIX}${tagId}-baseDisc`,
          origin: center,
          geometry: new ReadableGeometry(viewer.scene, buildCylinderGeometry({
            radiusTop: BASE_DISC_RADIUS,
            radiusBottom: BASE_DISC_RADIUS,
            height: BASE_DISC_THICKNESS,
            radialSegments: 36,
            heightSegments: 1,
            openEnded: false,
          })),
          material: new PhongMaterial(viewer.scene, {
            diffuse: [0, 0, 0],
            emissive: [0, 0, 0],
            backfaces: true,
            alpha: 0,
            alphaMode: 'blend',
          }),
          position: [localX, floorY + BASE_DISC_THICKNESS / 2, localZ],
          pickable: false,
          collidable: false,
        });

        avatarsRef.current.set(tagId, { body, head, baseDisc });
      }

      // Eliminar avatares de tags desaparecidos
      for (const tagId of Array.from(avatarsRef.current.keys())) {
        if (!knownTagIds.has(tagId)) {
          const figure = avatarsRef.current.get(tagId);
          figure?.body.destroy();
          figure?.head.destroy();
          figure?.baseDisc.destroy();
          avatarsRef.current.delete(tagId);
        }
      }

      // Mover los existentes y actualizar su color. El emissive del cuerpo
      // y la cabeza se modula según la quality y el proximity_factor:
      //   - lejos de zona: tenue color quality.
      //   - cerca/dentro: rojo alarma + pulso a 1.5 Hz.
      const nowMs = performance.now();
      for (const tagId of knownTagIds) {
        const figure = avatarsRef.current.get(tagId);
        const interp = getInterpolated(tagId);
        if (!figure || !interp || !center || floorY == null) continue;
        const localX = interp.x - center[0];
        const localZ = interp.y - center[2];
        figure.body.position = [localX, floorY + BODY_HEIGHT / 2, localZ];
        figure.head.position = [localX, floorY + BODY_HEIGHT + HEAD_RADIUS, localZ];
        figure.baseDisc.position = [localX, floorY + BASE_DISC_THICKNESS / 2, localZ];

        const proxFactor = proximityStream.factorByTag(tagId);
        const c = avatarColors(interp.quality, proxFactor, nowMs);
        for (const m of [figure.body, figure.head]) {
          const mat = m.material as PhongMaterial;
          if (mat) { mat.diffuse = c.diffuse; mat.emissive = c.emissive; }
        }
        // Disco a los pies: emissive + alpha según factor (más opaco
        // que el aura porque es visto en planta, no de canto).
        const disc = baseDiscStyle(proxFactor, nowMs);
        const discMat = figure.baseDisc.material as PhongMaterial;
        if (discMat) { discMat.emissive = disc.emissive; discMat.alpha = disc.alpha; }
      }

      // ---- Camera-follow + trail del operario seguido ----
      const followSerial = followingSerialRef.current;
      if (followSerial) {
        const followInterp = getInterpolated(followSerial);
        if (followInterp && center && floorY != null) {
          // Posición mundial del operario (cabeza-pecho).
          const tx = followInterp.x;
          const ty = floorY + BODY_HEIGHT / 2;
          const tz = followInterp.y;
          // Cámara isométrica detrás-arriba con offset fijo. Ajustable
          // a futuro si quieres que rote alrededor del worker.
          const offX = 22, offY = 18, offZ = 22;
          const camCtl = viewer.scene.camera;
          if (cameraFlyToFollowRef.current) {
            // Primer tick tras activar follow → fly suave.
            cameraFlyToFollowRef.current = false;
            viewer.cameraFlight.flyTo({
              eye: [tx + offX, ty + offY, tz + offZ],
              look: [tx, ty, tz],
              up: [0, 1, 0],
              duration: 0.6,
            });
          } else {
            camCtl.eye = [tx + offX, ty + offY, tz + offZ];
            camCtl.look = [tx, ty, tz];
            camCtl.up = [0, 1, 0];
          }

          // Trail: añadimos posición actual al buffer y filtramos los
          // últimos 30 s. Coords mundiales para no depender de RTC.
          const TRAIL_WINDOW_MS = 30_000;
          const buf = trailBufferRef.current.get(followSerial) ?? [];
          // Solo añadir si la posición cambió perceptiblemente (≥ 0.2 m)
          // para no inflar el buffer cuando el worker está parado.
          const last = buf[buf.length - 1];
          if (!last || Math.hypot(last.x - tx, last.y - ty, last.z - tz) > 0.2) {
            buf.push({ x: tx, y: ty, z: tz, t: nowMs });
          }
          // Recorte por ventana de tiempo.
          const cutoff = nowMs - TRAIL_WINDOW_MS;
          while (buf.length > 0 && buf[0].t < cutoff) buf.shift();
          trailBufferRef.current.set(followSerial, buf);

          // Reconstruir mesh polyline con los puntos.
          if (trailMeshRef.current) {
            try { trailMeshRef.current.destroy(); } catch { /* ignore */ }
            trailMeshRef.current = null;
          }
          if (buf.length >= 2) {
            const positions: number[] = [];
            for (const p of buf) {
              positions.push(p.x - center[0], p.y, p.z - center[2]);
            }
            const indices: number[] = [];
            for (let i = 0; i < buf.length - 1; i++) indices.push(i, i + 1);
            trailMeshRef.current = new Mesh(viewer.scene, {
              id: 'rtls-follow-trail',
              origin: center,
              geometry: new ReadableGeometry(viewer.scene, {
                primitive: 'lines',
                positions,
                indices,
              }),
              material: new PhongMaterial(viewer.scene, {
                color: [0, 0, 0],
                emissive: [0.20, 0.78, 0.36], // verde brillante
              }),
              pickable: false,
              collidable: false,
            });
          }
        }
      }

      // Actualizar color emissive de cada zona (paredes translúcidas)
      // según el proximity_factor: ámbar al acercarse, rojo pulsante dentro.
      for (const zone of zonesRef.current) {
        const pair = zoneMeshesRef.current.get(zone.id);
        if (!pair) continue;
        const factor = proximityStream.factorByZone(zone.id);
        const color = interpolateZoneColor(zone.displayColor, factor, nowMs);
        const mat = pair.fill.material as PhongMaterial;
        if (mat) mat.emissive = color;
      }

      // Proyectar posición de cada avatar a pantalla → mover su label
      // HTML. La fórmula es: clip = projMatrix · viewMatrix · worldPos;
      // ndc = clip.xy / clip.w; screen = mapeo ndc→canvas pixels.
      const cam = viewer.scene.camera;
      const canvas = viewer.scene.canvas.canvas;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      for (const tagId of knownTagIds) {
        const labelEl = labelRefsMap.current.get(tagId);
        const interp = getInterpolated(tagId);
        if (!labelEl || !interp) continue;
        // El label se ancla un poco encima de la cabeza del muñeco.
        // Y absoluta = suelo + altura figura + margen, no relativa a la
        // altura publicada por el simulador.
        worldVec4[0] = interp.x;
        worldVec4[1] = (floorY ?? interp.z) + LABEL_Y_OFFSET;
        worldVec4[2] = interp.y;
        worldVec4[3] = 1;
        math.transformPoint4(cam.viewMatrix, worldVec4, viewVec4);
        math.transformPoint4(cam.projMatrix, viewVec4, clipVec4);
        if (clipVec4[3] <= 0) {
          // Detrás de la cámara → ocultar.
          labelEl.style.display = 'none';
          continue;
        }
        const ndcX = clipVec4[0] / clipVec4[3];
        const ndcY = clipVec4[1] / clipVec4[3];
        const sx = (ndcX + 1) * 0.5 * cw;
        const sy = (1 - ndcY) * 0.5 * ch;
        labelEl.style.display = 'flex';
        const selected = labelEl.dataset.rtlsSelected === 'true';
        const scale = selected ? ' scale(1.08)' : '';
        labelEl.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)${scale}`;
        // Color del círculo de iniciales: SIEMPRE el color base por
        // companyType (verde/azul/gris). La alarma de proximity se
        // refleja solo en el fondo de la pill — duplicar el cambio en el
        // círculo era redundante y restaba claridad de la identidad
        // (interno/externo) del operario.
        const circle = labelEl.querySelector(
          '[data-avatar-circle]'
        ) as HTMLElement | null;
        if (circle) {
          const baseColor = circle.dataset.baseColor || '#444';
          // Solo asignar si cambió, para no machacar styles cada frame.
          if (circle.style.background !== baseColor) {
            circle.style.background = baseColor;
          }
        }
        // Estilo de la pill según proximity_factor:
        //  - factor=0: pill blanca (estado normal).
        //  - APPROACHING: pill ámbar, texto blanco.
        //  - INSIDE: pill rojo pulsante con sombra que palpita.
        // Si está seleccionado, anteponemos un borde verde al boxShadow
        // (el `outline` no se vería bien con border-radius).
        const pf = proximityStream.factorByTag(tagId);
        const nameEl = labelEl.querySelector('[data-rtls-name]') as HTMLElement | null;
        const subEl = labelEl.querySelector('[data-rtls-sub]') as HTMLElement | null;
        const selectionPrefix = selected
          ? '0 0 0 2px #34c759, 0 0 14px rgba(52,199,89,0.5), '
          : '';
        if (pf <= 0) {
          labelEl.style.background = 'rgba(255, 255, 255, 0.92)';
          labelEl.style.boxShadow = selectionPrefix
            + '0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)';
          if (nameEl) nameEl.style.color = '#1a1f2c';
          if (subEl) subEl.style.color = '#5a6273';
        } else if (pf >= 1.0) {
          const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0094);
          const glow = 8 + 14 * pulse;
          labelEl.style.background = 'rgba(230, 57, 57, 0.96)';
          labelEl.style.boxShadow = selectionPrefix
            + `0 0 ${glow.toFixed(1)}px rgba(230, 57, 57, 0.85), 0 2px 6px rgba(0,0,0,0.3)`;
          if (nameEl) nameEl.style.color = '#fff';
          if (subEl) subEl.style.color = 'rgba(255,255,255,0.85)';
        } else {
          const alpha = (0.65 + 0.30 * pf).toFixed(3);
          labelEl.style.background = `rgba(245, 158, 11, ${alpha})`;
          labelEl.style.boxShadow = selectionPrefix
            + '0 2px 8px rgba(245,158,11,0.45), 0 0 0 1px rgba(0,0,0,0.04)';
          if (nameEl) nameEl.style.color = '#fff';
          if (subEl) subEl.style.color = 'rgba(255,255,255,0.85)';
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
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: SKY_GRADIENT_CSS,
      }}
    >
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
      {/* NavCube canvas — mismo patrón visual que en el DT. */}
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
      {/* Labels HTML proyectados — un badge por tag, glassmorphism,
          avatar circular con iniciales coloreado por quality, nombre
          + código abajo. pointerEvents:none para no robar clicks al
          canvas. La quality del avatar se actualiza vía data attr en
          el tick (no re-render por frame). */}
      {tagIds.map((tagId) => {
        const tag = tagsBySerial[tagId];
        const workerName = tag?.assignedWorkerName ?? null;
        const companyName = tag?.assignedWorkerCompanyName ?? null;
        const companyType = tag?.assignedWorkerCompanyType ?? null;
        const isSelected = selectedSerial === tagId;
        const initials = workerName
          ? workerName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('')
          : '?';
        // Sin worker asignado → muestra tag serial. Con worker → nombre arriba, empresa abajo.
        const main = workerName ?? 'Sin asignar';
        const sub = workerName
          ? (companyName ?? tag?.assignedWorkerCode ?? tagId)
          : tagId;
        // Color del círculo de iniciales:
        //  - INTERNAL    → verde
        //  - CONTRACTOR  → azul
        //  - VISITOR     → morado
        //  - sin worker  → gris oscuro
        const circleBaseColor =
          !workerName ? '#444'
            : companyType === 'INTERNAL' ? '#34c759'
            : companyType === 'VISITOR' ? '#9b5fc7'
            : '#3a8ee0';
        return (
          <div
            key={tagId}
            ref={(el) => {
              if (el) labelRefsMap.current.set(tagId, el);
              else labelRefsMap.current.delete(tagId);
            }}
            onClick={() => onAvatarClick?.(tagId)}
            data-rtls-selected={isSelected ? 'true' : 'false'}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: 'translate(-9999px, -9999px)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px 4px 4px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              // Selección: borde verde + glow suave + sube por encima.
              // La proximity sigue cambiando el background en el tick.
              boxShadow: isSelected
                ? '0 0 0 2px #34c759, 0 4px 14px rgba(52,199,89,0.45), 0 2px 6px rgba(0,0,0,0.2)'
                : '0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
              zIndex: isSelected ? 100 : 1,
              transformOrigin: 'center bottom',
              transition: 'box-shadow 120ms ease-out',
              // Pill clickeable → abre WorkerInfoPanel.
              pointerEvents: 'auto',
              cursor: 'pointer',
              userSelect: 'none',
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              data-avatar-circle
              data-base-color={circleBaseColor}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: circleBaseColor,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                boxShadow: '0 0 0 2px #fff',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                data-rtls-name
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#1a1f2c',
                  lineHeight: 1.15,
                }}
              >
                {main}
              </div>
              <div
                data-rtls-sub
                style={{
                  fontSize: 10,
                  color: '#5a6273',
                  lineHeight: 1.15,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {sub}
              </div>
            </div>
          </div>
        );
      })}
      {!plantView && (
        <Box
          sx={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.6)',
          }}
        >
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}

export default PositioningViewer3D;
