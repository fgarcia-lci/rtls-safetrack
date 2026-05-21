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
  buildPlaneGeometry,
  PhongMaterial,
  math,
} from '@xeokit/xeokit-sdk';
import { Box, CircularProgress } from '@mui/material';
import { usePositionsStream } from '../../hooks/usePositionsStream';
import { tagService } from '../../services/tagService';
import { zoneService } from '../../services/zoneService';
import { proximityStream } from '../../services/proximityStream';
import { userViewPrefsService } from '../../services/userViewPrefsService';
import { loadXktBytes } from '../../utils/xktCache';
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
  /** Doble click sobre avatar/pildora → zoom in sin follow. */
  onAvatarDoubleClick?: (tagId: string) => void;
  /** Click sobre un mesh de zona — abre el modal de detalle (#52). */
  onZoneClick?: (zone: SafetyZone) => void;
  /** Serial del operario seleccionado (panel abierto). null si ninguno. */
  selectedSerial?: string | null;
  /** Serial del operario al que la cámara está siguiendo. null = libre. */
  followingSerial?: string | null;
  /** Offset Y aplicado al modelo (m). Reactivo: cambios en runtime se
   *  propagan al `model.position` ya cargado. */
  modelYOffset?: number;
  /** Vista inicial guardada — si está, se usa en lugar del fly-to AABB
   *  default al cargar el modelo. */
  initialCameraEye?: [number, number, number] | null;
  initialCameraLook?: [number, number, number] | null;
  /** Altura total del avatar (cuerpo + cabeza) en metros. Default 2 m. */
  avatarHeightM?: number;
  /** Distancia de la cámara al operario al hacer fly-to / follow (m). */
  cameraFollowDistance?: number;
  /** Azimuth (rotación horizontal) en grados — 0=N, 90=E, 180=S, 270=O. */
  cameraFollowAzimuthDeg?: number;
  /** Elevación en grados — 0=ras del suelo, 90=cenital. */
  cameraFollowElevationDeg?: number;
  /**
   * Set de tagSerials con SOS activo en este instante. Cuando un serial
   * está aquí, se pinta un texto "SOS" parpadeante en rojo encima de su
   * pildora. Live → del WS de SOS. Replay → de activeSosEvents.
   */
  sosActiveTagIds?: Set<string>;
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
  onAvatarDoubleClick,
  onZoneClick,
  selectedSerial = null,
  followingSerial = null,
  modelYOffset = 0,
  initialCameraEye = null,
  initialCameraLook = null,
  avatarHeightM = 2.0,
  cameraFollowDistance = 25,
  cameraFollowAzimuthDeg = 45,
  cameraFollowElevationDeg = 30,
  sosActiveTagIds,
}: Props) {
  // Inyecta las keyframes del parpadeo "SOS" una sola vez al cargar este
  // componente. No queremos importar emotion/styled aquí solo para esto.
  useEffect(() => {
    const id = 'rtls-sos-blink-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes rtls-sos-blink {
        0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
        50% { opacity: 0.35; transform: translateX(-50%) scale(1.08); }
      }
    `;
    document.head.appendChild(style);
  }, []);

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
  /** Plano sólido color tierra que rellena los cuadros del grid (debajo de las líneas). */
  const floorSolidMeshRef = useRef<Mesh | null>(null);
  const rafRef = useRef<number | null>(null);
  // Camera-follow: prop como ref para que el tick siempre use el último valor.
  const followingSerialRef = useRef<string | null>(followingSerial);
  useEffect(() => {
    // Cuando se activa por primera vez, hacer un fly suave; cuando se
    // desactiva, limpiar trail y la ref del último target.
    if (followingSerial !== followingSerialRef.current) {
      cameraFlyToFollowRef.current = followingSerial !== null;
      lastFollowTargetRef.current = null;
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
  // Última posición del worker que se está siguiendo. Se usa para
  // calcular el DELTA de movimiento por frame y desplazar la cámara la
  // misma cantidad → el offset cámara-worker que el usuario ha elegido
  // (orbit/zoom) se preserva mientras el worker se mueve.
  const lastFollowTargetRef = useRef<[number, number, number] | null>(null);
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
  // Ref al callback de click de zona — el handler de mouseclicked se
  // crea una sola vez, así que vamos por ref para no quedarnos con un
  // closure stale del primer render.
  const onZoneClickRef = useRef(onZoneClick);
  useEffect(() => { onZoneClickRef.current = onZoneClick; }, [onZoneClick]);
  const onAvatarDoubleClickRef = useRef(onAvatarDoubleClick);
  useEffect(() => { onAvatarDoubleClickRef.current = onAvatarDoubleClick; }, [onAvatarDoubleClick]);
  // Fly-to compartido entre dblclick del canvas y dblclick del pildora.
  // Se asigna al crear el viewer (necesita acceso al cameraFlight).
  const flyToAvatarRef = useRef<((tagId: string) => void) | null>(null);

  const { tagIds, getInterpolated } = usePositionsStream(plantId);
  // Ref para que el handler de mouseclicked (registrado UNA vez en el
  // useEffect del viewer) lea siempre la versión actual de
  // getInterpolated en lugar de la del primer render.
  const getInterpolatedRef = useRef(getInterpolated);
  useEffect(() => { getInterpolatedRef.current = getInterpolated; }, [getInterpolated]);

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
  // Flip a true cuando el viewer + loader están creados y los refs
  // poblados. Necesario en deps del effect de carga de layers para
  // garantizar re-trigger cuando el viewer aparece después de que
  // `layers` ya esté memoizado (race en navegación SPA).
  const [viewerReady, setViewerReady] = useState(false);

  // Refs para aplicar offset Y / vista inicial dinámicamente. Las props
  // van vía ref porque la carga del modelo es async y queremos coger el
  // valor actual cuando 'loaded' dispara, no el del primer render.
  const modelYOffsetRef = useRef(modelYOffset);
  // Escala de avatares — el user configura la ALTURA TOTAL en metros
  // (cuerpo + cabeza). Internamente el factor de escala es
  // avatarHeightM / NATURAL_HEIGHT, donde NATURAL_HEIGHT es la suma de
  // las constantes del modelo geométrico (BODY_HEIGHT + HEAD_RADIUS*2).
  const NATURAL_AVATAR_HEIGHT = BODY_HEIGHT + HEAD_RADIUS * 2;
  const avatarScaleRef = useRef(avatarHeightM / NATURAL_AVATAR_HEIGHT);
  useEffect(() => {
    avatarScaleRef.current = avatarHeightM / NATURAL_AVATAR_HEIGHT;
  }, [avatarHeightM, NATURAL_AVATAR_HEIGHT]);

  // Refs reactivas con la config de cámara para localizar/seguir operario.
  // Las usan flyToAvatar (creada una vez al montar viewer) y el tick de
  // follow — ambos cierran sobre estos refs para coger siempre el valor
  // más reciente al cambiar sliders.
  const camFollowDistRef = useRef(cameraFollowDistance);
  const camFollowAzRef = useRef(cameraFollowAzimuthDeg);
  const camFollowElevRef = useRef(cameraFollowElevationDeg);
  useEffect(() => { camFollowDistRef.current = cameraFollowDistance; }, [cameraFollowDistance]);
  useEffect(() => { camFollowAzRef.current = cameraFollowAzimuthDeg; }, [cameraFollowAzimuthDeg]);
  useEffect(() => { camFollowElevRef.current = cameraFollowElevationDeg; }, [cameraFollowElevationDeg]);
  useEffect(() => {
    // Al cambiar la altura, eliminar avatares para que el tick los recree.
    for (const avatar of avatarsRef.current.values()) {
      try { avatar.body?.destroy(); } catch { /* ignore */ }
      try { avatar.head?.destroy(); } catch { /* ignore */ }
      try { avatar.baseDisc?.destroy(); } catch { /* ignore */ }
    }
    avatarsRef.current.clear();
  }, [avatarHeightM]);
  // plantViewId via ref para que el callback `model.on('loaded')`
  // (que vive dentro del closure del effect) siempre lea el id ACTUAL,
  // no el del primer render donde plantView pudo ser null.
  const plantViewIdRef = useRef<number | null>(plantView?.id ?? null);
  useEffect(() => { plantViewIdRef.current = plantView?.id ?? null; }, [plantView]);
  const initialCameraEyeRef = useRef(initialCameraEye);
  const initialCameraLookRef = useRef(initialCameraLook);
  // Map de modelos cargados — necesario para aplicar offset en runtime
  // cuando el user mueve el slider del panel de ajustes.
  const loadedModelsRef = useRef<Map<string, ReturnType<XKTLoaderPlugin['load']>>>(new Map());
  useEffect(() => { modelYOffsetRef.current = modelYOffset; }, [modelYOffset]);
  useEffect(() => { initialCameraEyeRef.current = initialCameraEye; }, [initialCameraEye]);
  useEffect(() => { initialCameraLookRef.current = initialCameraLook; }, [initialCameraLook]);

  // Aplicar offset Y al modelo ya cargado cuando cambia el prop —
  // permite que el slider del panel mueva el modelo en vivo.
  useEffect(() => {
    for (const m of loadedModelsRef.current.values()) {
      try { m.position = [0, modelYOffset, 0]; } catch { /* ignore */ }
    }
  }, [modelYOffset]);
  useEffect(() => {
    proximityStream.setPlant(plantId);
    let cancelled = false;
    zoneService.listByPlant(plantId, true).then((zs) => {
      if (cancelled) return;
      setZones(zs);
      zonesRef.current = zs;
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
    setViewerReady(true);

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

    // Click sobre avatar → emitir tagId. Las figuritas tienen 2 meshes
    // (avatar-{tagId}-body, avatar-{tagId}-head); quitar prefijo y
    // sufijo para sacar el tagId limpio.
    // Click sobre zona → resolver zoneId desde el mesh id (zone-{id}-fill)
    // y emitir la zona completa al padre (#52).
    viewer.scene.input.on('mouseclicked', (coords: number[]) => {
      const [cx, cy] = coords as [number, number];

      // Pre-check screen-space contra los avatares: body+head son meshes
      // muy pequeños y el `scene.pick` del XKT prioriza el muro de detrás
      // cuando el click cae un par de pixels fuera de la silueta. Aquí
      // proyectamos manualmente el centro vertical del avatar a la
      // pantalla y, si el click cae a menos de N pixels, abrimos el
      // panel del operario directamente.
      const PICK_RADIUS_PX = 28;
      let closestTagId: string | null = null;
      let closestDist = Infinity;
      const interpFn = getInterpolatedRef.current;
      if (interpFn) {
        const cam = viewer.scene.camera;
        const canvas = canvasRef.current;
        for (const tagId of avatarsRef.current.keys()) {
          const interp = interpFn(tagId);
          if (!interp || !canvas) continue;
          const s = avatarScaleRef.current || 1;
          const bodyH = BODY_HEIGHT * s;
          const headR = HEAD_RADIUS * s;
          // Centro del torso del avatar. Coords mundiales directas:
          // xeokit Y=up, así que mapeamos interp.y → mundo.z, y los
          // pies del avatar van a `interp.z` (altura real).
          const wx = interp.x;
          const wy = interp.z + bodyH * 0.5 + headR;
          const wz = interp.y;
          const v4 = math.vec4([wx, wy, wz, 1]);
          const view = math.transformPoint4(cam.viewMatrix, v4, math.vec4());
          const clip = math.transformPoint4(cam.projMatrix, view, math.vec4());
          if (clip[3] <= 0) continue;
          const ndcX = clip[0] / clip[3];
          const ndcY = clip[1] / clip[3];
          const sx = (ndcX + 1) * 0.5 * canvas.clientWidth;
          const sy = (1 - ndcY) * 0.5 * canvas.clientHeight;
          const d = Math.hypot(sx - cx, sy - cy);
          if (d < closestDist) { closestDist = d; closestTagId = tagId; }
        }
      }
      if (closestTagId && closestDist <= PICK_RADIUS_PX) {
        onAvatarClick?.(closestTagId);
        return;
      }

      const hit = viewer.scene.pick({ canvasPos: [cx, cy] });
      const id = hit?.entity?.id as string | undefined;
      if (!id || typeof id !== 'string') return;
      if (id.startsWith(AVATAR_PREFIX)) {
        const rest = id.substring(AVATAR_PREFIX.length);
        const tagId = rest.replace(/-(body|head|baseDisc)$/, '');
        onAvatarClick?.(tagId);
        return;
      }
      const zoneMatch = id.match(/^zone-(\d+)-fill$/);
      if (zoneMatch) {
        const zoneId = Number(zoneMatch[1]);
        const zone = zonesRef.current.find((z) => z.id === zoneId);
        if (zone) onZoneClickRef.current?.(zone);
        return;
      }
      // Elementos sintéticos nuestros (suelo grid, etc.) — ignorar.
      if (id.startsWith('rtls-')) return;
      // El resto = entity del modelo XKT. Sincronizamos con el TreeView:
      // - Expande/scroll al nodo correspondiente
      // - Highlight la entity en la escena (limpia previa antes)
      try {
        viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
        viewer.scene.setObjectsHighlighted([id], true);
      } catch { /* ignore */ }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tree = (window as any).__rtlsTreeView;
      if (tree?.showNode) {
        try { tree.showNode(id); } catch { /* ignore */ }
        setTimeout(() => {
          const li = document.getElementById(`tree-0-${id}`);
          if (li) {
            try { li.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* ignore */ }
          }
        }, 100);
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

    // Doble click sobre avatar → zoom in al operario sin activar follow.
    // Mismo screen-space pick que el single-click handler — busca el avatar
    // más cercano al cursor en pixels (radio PICK_RADIUS_PX).
    const dblclickHandler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const PICK_RADIUS_PX = 36;
      let closestTagId: string | null = null;
      let closestDist = Infinity;
      const interpFn = getInterpolatedRef.current;
      const cam = viewer.scene.camera;
      if (!interpFn) return;
      for (const tagId of avatarsRef.current.keys()) {
        const interp = interpFn(tagId);
        if (!interp) continue;
        const s = avatarScaleRef.current || 1;
        const bodyH = BODY_HEIGHT * s;
        const headR = HEAD_RADIUS * s;
        const wx = interp.x;
        const wy = interp.z + bodyH * 0.5 + headR;
        const wz = interp.y;
        const v4 = math.vec4([wx, wy, wz, 1]);
        const view = math.transformPoint4(cam.viewMatrix, v4, math.vec4());
        const clip = math.transformPoint4(cam.projMatrix, view, math.vec4());
        if (clip[3] <= 0) continue;
        const ndcX = clip[0] / clip[3];
        const ndcY = clip[1] / clip[3];
        const sx = (ndcX + 1) * 0.5 * canvas.clientWidth;
        const sy = (1 - ndcY) * 0.5 * canvas.clientHeight;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < closestDist) { closestDist = d; closestTagId = tagId; }
      }
      if (closestTagId && closestDist <= PICK_RADIUS_PX) {
        flyToAvatar(closestTagId);
        onAvatarDoubleClickRef.current?.(closestTagId);
      }
    };
    canvas.addEventListener('dblclick', dblclickHandler);

    // Helper compartido — fly-to a la posición actual del operario sin
    // activar follow. Lo usan tanto el dblclick del canvas como el del
    // pildora (vía ref guardada abajo).
    const flyToAvatar = (tagId: string) => {
      const interpFn = getInterpolatedRef.current;
      if (!interpFn) return;
      const interp = interpFn(tagId);
      if (!interp) return;
      const s = avatarScaleRef.current || 1;
      const look = [interp.x, interp.z + BODY_HEIGHT * s * 0.5, interp.y] as [number, number, number];
      // Eye en coords esféricas alrededor del operario, configurables por
      // usuario. Permite huir de paredes que tapen subiendo elevation, o
      // rotar alrededor cambiando azimuth.
      const dist = Math.max(2, camFollowDistRef.current);
      const azRad = (camFollowAzRef.current * Math.PI) / 180;
      const elevRad = (camFollowElevRef.current * Math.PI) / 180;
      const horiz = dist * Math.cos(elevRad);
      const eye = [
        interp.x + horiz * Math.sin(azRad),
        look[1] + dist * Math.sin(elevRad),
        interp.y + horiz * Math.cos(azRad),
      ] as [number, number, number];
      try {
        viewer.cameraFlight.flyTo({ eye, look, up: [0, 1, 0], duration: 0.6 });
      } catch { /* ignore */ }
    };
    flyToAvatarRef.current = flyToAvatar;

    // Expose `flyToTag` on the viewer window key so paneles laterales (p.ej.
    // WorkerInfoPanel) puedan acercar la cámara a un operario sin tener que
    // pasar por props ni callbacks.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__rtlsViewer.flyToTag = flyToAvatar;

    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
      canvas.removeEventListener('dblclick', dblclickHandler);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      avatarsRef.current.clear();
      loadedLayersRef.current.clear();
      loadedModelsRef.current.clear();
      cameraFramedRef.current = false;
      floorMeshRef.current = null;
      floorSolidMeshRef.current = null;
      trailMeshRef.current = null;
      trailBufferRef.current.clear();
      try { viewer.destroy(); } catch { /* viewer may already be destroyed */ }
      viewerRef.current = null;
      xktLoaderRef.current = null;
      navCubeRef.current = null;
      setViewerReady(false);
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

    // Dedup natural: el viewer.scene.models gestiona ids únicos, así
    // usamos eso como guard (en lugar de un lock global compartido que
    // antes causaba races con cargas asíncronas del cache).
    let cancelled = false;
    layers.forEach((layer: PlantViewLayer) => {
      if (viewer.scene.models[layer.code]) return;

      // Carga del XKT vía cache IndexedDB: en hot/cold reload posterior
      // se sirve desde IDB en milisegundos. La primera vez hace fetch
      // y cachea. El XKTLoaderPlugin recibe los bytes pre-cargados.
      loadXktBytes(layer.assetUrl).then((xkt) => {
        // Verificaciones al resolver: cancelado, viewer/loader cambiados,
        // o ya cargado por otra instancia → abortar silenciosamente.
        if (cancelled) return;
        if (viewerRef.current !== viewer) return;
        if (xktLoaderRef.current !== loader) return;
        if (viewer.scene.models[layer.code]) return;

        const model = loader.load({
          id: layer.code,
          xkt,
          edges: true,
        });

      model.on('loaded', () => {
        // No usamos `cancelled` aquí: el cleanup del effect (re-render
        // del padre) NO debe invalidar la inicialización del modelo
        // recién cargado. Solo abortamos si el viewer cambió.
        if (viewerRef.current !== viewer) return;
        model.visible = layer.defaultVisible;
        // Registramos el modelo para que el effect del offset Y pueda
        // moverlo en runtime cuando el user toca el slider.
        loadedModelsRef.current.set(layer.code, model);
        // CAPTURAR aabb ANTES de aplicar offset. El grid y la cámara
        // inicial deben usar el aabb original (no el desplazado), porque
        // si no, el grid baja con el modelo y la separación visual es 0
        // — el modelo "vuelve a flotar".
        const originalAabb = Array.from(model.aabb) as number[];
        // Offset vertical inicial del modelo. Se lee de la ref (no del
        // prop) para sobrevivir el race donde el modelo carga antes de
        // que el padre haya hecho setState con el valor de BD. La ref se
        // mantiene siempre actualizada con el último prop.
        const currentYOffset = modelYOffsetRef.current;
        if (typeof currentYOffset === 'number' && currentYOffset !== 0) {
          model.position = [0, currentYOffset, 0];
        }
        // Restaurar visibilidad guardada por el usuario (per-user prefs en
        // BD). Si el usuario cierra y reabre el visor, vuelve a tener
        // ocultos los mismos nodos que dejó en su última sesión.
        const currentPvId = plantViewIdRef.current;
        if (currentPvId != null) {
          userViewPrefsService.get(currentPvId).then((prefs) => {
            const ids = prefs.hiddenNodeIds ?? [];
            if (ids.length === 0) return;
            const validIds = ids.filter((id) => viewer.scene.objects[id]);
            if (validIds.length > 0) {
              try { viewer.scene.setObjectsVisible(validIds, false); } catch { /* ignore */ }
            }
          }).catch(() => { /* ignore */ });
        }

        // Rejilla de líneas como suelo de referencia (estilo Blender/Unity).
        // Probamos con plano sólido (Plane y Box, con y sin RTC) y siempre
        // sufre el mismo bug de xeokit a coords mundiales ~32M: los 2
        // triángulos de cada quad se separan en pantalla y uno renderiza
        // como back-face → diagonal negro/color. Las líneas no son
        // triángulos, así que el bug no aplica. Usamos `origin` igualmente
        // por buena práctica (RTC).
        if (!floorMeshRef.current) {
          // Usamos originalAabb (capturado antes del offset) para que el
          // grid quede a la altura original del modelo, no a la desplazada.
          const aabb = originalAabb;
          const centerX = (aabb[0] + aabb[3]) / 2;
          const centerZ = (aabb[2] + aabb[5]) / 2;
          const modelMaxSize = Math.max(aabb[3] - aabb[0], aabb[5] - aabb[2]);
          // Guardamos el centro del modelo para que el tick de avatares
          // pueda crearlos con RTC origin (mismo truco que la rejilla).
          modelCenterRef.current = [centerX, 0, centerZ];
          floorYRef.current = aabb[1];
          // Rejilla 1.4x el modelo — antes era 3x pero saturaba la
          // pantalla con un suelo enorme alrededor de un edificio pequeño.
          // Un margen del 40% queda natural y mantiene contexto.
          const gridSize = modelMaxSize * 1.4;
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
            // Líneas WebGL son siempre 1px (limitación estándar). Color
            // tierra claro / crema para que el suelo de planta industrial
            // se distinga del fondo oscuro y se lea como "área de trabajo".
            // RGB 0-1 — color es el difuso, emissive lo que se ve sin luz.
            material: new PhongMaterial(viewer.scene, {
              color: [0.65, 0.55, 0.40],
              emissive: [0.83, 0.74, 0.58],
            }),
            position: [0, floorY, 0],
            pickable: false,
            collidable: false,
          });
          floorMeshRef.current = floor;

          // Plano sólido color tierra/crema justo debajo del grid de líneas.
          // El grid xeokit es solo LINES, así que para que los cuadritos se
          // vean rellenos hace falta este mesh adicional. Lo bajamos 0.05 m
          // para evitar z-fighting con las líneas. Pickable/collidable false
          // — no debe interferir con clicks en zonas/avatares.
          const solidFloor = new Mesh(viewer.scene, {
            id: 'rtls-floor-solid',
            origin: [centerX, 0, centerZ],
            geometry: new ReadableGeometry(viewer.scene, buildPlaneGeometry({
              xSize: gridSize,
              zSize: gridSize,
            })),
            material: new PhongMaterial(viewer.scene, {
              // Tierra clara / crema — RGB 0-1.
              diffuse: [0.83, 0.74, 0.58],
              emissive: [0.83, 0.74, 0.58],
              ambient: [0.6, 0.55, 0.45],
              alpha: 0.85,
              alphaMode: 'blend',
            }),
            position: [0, floorY - 0.05, 0],
            pickable: false,
            collidable: false,
          });
          floorSolidMeshRef.current = solidFloor;
          console.log(
            '[3D] Grid suelo creado. origin=', [centerX, 0, centerZ],
            ' size=', gridSize, ' divisions=', divisions, ' floorY=', floorY,
          );
        }

        // Encuadrar SOLO al modelo, ignorando los avatares.
        if (!cameraFramedRef.current) {
          // Si hay vista guardada (capturada por el panel), úsala. Si
          // no, calculamos un eye/look más cercano que el `flyTo(aabb)`
          // por defecto (que aleja mucho la cámara según el FOV).
          const savedEye = initialCameraEyeRef.current;
          const savedLook = initialCameraLookRef.current;
          if (savedEye && savedLook) {
            viewer.cameraFlight.jumpTo({ eye: savedEye, look: savedLook, up: [0, 1, 0] });
          } else {
            // Cámara inicial referenciada al aabb original (no desplazado).
            const aabb = originalAabb;
            const cx = (aabb[0] + aabb[3]) / 2;
            const cy = (aabb[1] + aabb[4]) / 2;
            const cz = (aabb[2] + aabb[5]) / 2;
            const sizeX = aabb[3] - aabb[0];
            const sizeZ = aabb[5] - aabb[2];
            const radius = Math.max(sizeX, sizeZ) * 0.7;
            // Vista isométrica: cámara alta y desplazada 45º en planta.
            viewer.cameraFlight.jumpTo({
              eye: [cx + radius * 0.7, cy + radius * 0.8, cz + radius * 0.7],
              look: [cx, cy, cz],
              up: [0, 1, 0],
            });
          }
          cameraFramedRef.current = true;
        }

        // Aviso al efecto de zonas que ya puede pintar — modelCenterRef
        // está seteado y el modelo es visible.
        setModelReady(true);
      });
      }).catch((err) => {
        console.error(`[3D] Failed to load layer "${layer.code}":`, err);
      });
    });

    return () => {
      cancelled = true;
    };
    // viewerReady en deps garantiza re-trigger cuando el viewer se
    // crea después de que layers ya esté memoizado (ver nota en el
    // useState de viewerReady).
  }, [layers, viewerReady]);

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
        // pickable=true para que el click sobre la zona dispare el
        // modal de detalle (#52). collidable false para no estorbar al
        // pick de avatares (que está siempre por encima visualmente).
        pickable: true,
        collidable: false,
      });

      zoneMeshesRef.current.set(zone.id, { fill });
    }

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
        // Multiplicador de tamaño leído desde el ref (config del panel).
        const s = avatarScaleRef.current || 1;
        const bodyHeight = BODY_HEIGHT * s;
        const bodyRadius = BODY_RADIUS * s;
        const headRadius = HEAD_RADIUS * s;
        // Los pies del operario van a la `z` real del simulador (o del
        // HW), no pegados al suelo del modelo. Así si z = suelo, se ve
        // al suelo; si z está por encima, se ve subido. Reveal-time
        // de errores de calibración del simulador, pero coherente con
        // la altura que mostramos en el panel.
        const feetY = interp.z;
        const bodyCenterY = feetY + bodyHeight / 2;
        const headCenterY = feetY + bodyHeight + headRadius;
        const color = QUALITY_COLOR[interp.quality];
        const emissive = color.map((c) => c * 0.3) as [number, number, number];
        const body = new Mesh(viewer.scene, {
          id: `${AVATAR_PREFIX}${tagId}-body`,
          origin: center,
          geometry: new ReadableGeometry(viewer.scene, buildCylinderGeometry({
            radiusTop: bodyRadius,
            radiusBottom: bodyRadius,
            height: bodyHeight,
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
            radius: headRadius,
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
          position: [localX, feetY + BASE_DISC_THICKNESS / 2, localZ],
          pickable: false,
          collidable: false,
        });

        // (Hitbox cilíndrico eliminado — el pick contra el avatar lo
        // hace el handler de mouseclicked en screen-space, comparando la
        // proyección del centro del avatar contra la posición del click.
        // Eso evita tener que dibujar un mesh invisible y es más fiable
        // a distancias largas.)
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
        const s = avatarScaleRef.current || 1;
        const bodyH = BODY_HEIGHT * s;
        const headR = HEAD_RADIUS * s;
        const feetY = interp.z;
        figure.body.position = [localX, feetY + bodyH / 2, localZ];
        figure.head.position = [localX, feetY + bodyH + headR, localZ];
        figure.baseDisc.position = [localX, feetY + BASE_DISC_THICKNESS / 2, localZ];

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
      // Estrategia "delta-based": cada frame computamos cuánto se ha
      // movido el worker y desplazamos eye+look la misma cantidad. Eso
      // preserva el offset que el usuario ha elegido (orbit + zoom)
      // mientras la cámara persigue al worker. Resultado: zoom y rotate
      // funcionan como siempre, solo "engancha" la posición del look.
      const followSerial = followingSerialRef.current;
      if (followSerial) {
        const followInterp = getInterpolated(followSerial);
        if (followInterp && center && floorY != null) {
          const tx = followInterp.x;
          const ty = floorY + BODY_HEIGHT / 2;
          const tz = followInterp.y;
          const camCtl = viewer.scene.camera;

          if (cameraFlyToFollowRef.current) {
            // Primera activación → fly suave usando los mismos sphericals
            // configurados por el usuario para localizar/seguir. Eso
            // mantiene coherencia entre los dos modos.
            cameraFlyToFollowRef.current = false;
            const dist = Math.max(2, camFollowDistRef.current);
            const azRad = (camFollowAzRef.current * Math.PI) / 180;
            const elevRad = (camFollowElevRef.current * Math.PI) / 180;
            const horiz = dist * Math.cos(elevRad);
            const eye: [number, number, number] = [
              tx + horiz * Math.sin(azRad),
              ty + dist * Math.sin(elevRad),
              tz + horiz * Math.cos(azRad),
            ];
            viewer.cameraFlight.flyTo({
              eye,
              look: [tx, ty, tz],
              up: [0, 1, 0],
              duration: 0.6,
            });
            lastFollowTargetRef.current = [tx, ty, tz];
          } else {
            // Frames sucesivos → desplaza cámara por el delta del worker.
            const last = lastFollowTargetRef.current;
            if (last) {
              const dx = tx - last[0];
              const dy = ty - last[1];
              const dz = tz - last[2];
              if (dx !== 0 || dy !== 0 || dz !== 0) {
                const eye = camCtl.eye;
                const look = camCtl.look;
                camCtl.eye = [eye[0] + dx, eye[1] + dy, eye[2] + dz];
                camCtl.look = [look[0] + dx, look[1] + dy, look[2] + dz];
              }
            }
            lastFollowTargetRef.current = [tx, ty, tz];
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
        // Label justo encima del muñequito ESCALADO. La altura del
        // avatar cambia con avatarHeightM, así que calculamos el offset
        // dinámicamente con avatarScaleRef + margen pequeño (0.3 m).
        const s = avatarScaleRef.current || 1;
        const dynamicLabelOffset = NATURAL_AVATAR_HEIGHT * s + 0.3;
        worldVec4[0] = interp.x;
        // La pildora ahora se ancla sobre la cabeza del avatar, cuyo
        // suelo es `interp.z` (la altura real del operario), no el
        // suelo del modelo. Así sigue al operario si está subido.
        worldVec4[1] = interp.z + dynamicLabelOffset;
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
        // -8px en Y para que el ápice del pico (que sobresale 8px bajo
        // la pildora) toque exactamente el punto del avatar en pantalla.
        labelEl.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy - 8}px)${scale}`;
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
        const arrowEl = labelEl.querySelector('[data-rtls-arrow]') as HTMLElement | null;
        const selectionPrefix = selected
          ? '0 0 0 2px #34c759, 0 0 14px rgba(52,199,89,0.5), '
          : '';
        let arrowColor = 'rgba(255, 255, 255, 0.92)';
        if (pf <= 0) {
          labelEl.style.background = 'rgba(255, 255, 255, 0.92)';
          labelEl.style.boxShadow = selectionPrefix
            + '0 2px 6px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)';
          if (nameEl) nameEl.style.color = '#1a1f2c';
          if (subEl) subEl.style.color = '#5a6273';
          arrowColor = 'rgba(255, 255, 255, 0.92)';
        } else if (pf >= 1.0) {
          const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0094);
          const glow = 8 + 14 * pulse;
          labelEl.style.background = 'rgba(230, 57, 57, 0.96)';
          labelEl.style.boxShadow = selectionPrefix
            + `0 0 ${glow.toFixed(1)}px rgba(230, 57, 57, 0.85), 0 2px 6px rgba(0,0,0,0.3)`;
          if (nameEl) nameEl.style.color = '#fff';
          if (subEl) subEl.style.color = 'rgba(255,255,255,0.85)';
          arrowColor = 'rgba(230, 57, 57, 0.96)';
        } else {
          const alpha = (0.65 + 0.30 * pf).toFixed(3);
          labelEl.style.background = `rgba(245, 158, 11, ${alpha})`;
          labelEl.style.boxShadow = selectionPrefix
            + '0 2px 8px rgba(245,158,11,0.45), 0 0 0 1px rgba(0,0,0,0.04)';
          if (nameEl) nameEl.style.color = '#fff';
          if (subEl) subEl.style.color = 'rgba(255,255,255,0.85)';
          arrowColor = `rgba(245, 158, 11, ${alpha})`;
        }
        if (arrowEl && arrowEl.style.borderTopColor !== arrowColor) {
          arrowEl.style.borderTopColor = arrowColor;
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
        const isFollowing = followingSerial === tagId;
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
        const hasSos = sosActiveTagIds?.has(tagId) ?? false;
        return (
          <div
            key={tagId}
            ref={(el) => {
              if (el) labelRefsMap.current.set(tagId, el);
              else labelRefsMap.current.delete(tagId);
            }}
            onClick={() => onAvatarClick?.(tagId)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              flyToAvatarRef.current?.(tagId);
              onAvatarDoubleClick?.(tagId);
            }}
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
            {/* Badge "SOS" parpadeante encima de la pildora cuando el
                operario tiene un SOS activo (live o replay). pointer-events
                none para no robar clicks al pildora subyacente. */}
            {hasSos && (
              <div
                style={{
                  position: 'absolute',
                  top: -22,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: '#e63939',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 2,
                  boxShadow: '0 0 10px rgba(230,57,57,0.95), 0 2px 4px rgba(0,0,0,0.3)',
                  animation: 'rtls-sos-blink 0.7s ease-in-out infinite',
                  pointerEvents: 'none',
                  textShadow: '0 0 4px rgba(0,0,0,0.5)',
                  zIndex: 200,
                }}
              >
                SOS
              </div>
            )}
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
            {/* Pico/protuberancia triangular bajo la pildora apuntando al
                muñequito. Útil cuando la cabeza queda oculta tras una
                pared o el zoom es alejado: el ápice del triángulo marca
                la posición exacta del operario. El color se sincroniza
                con el fondo de la pill en el tick para reflejar el
                estado (normal/aproximando/dentro de zona crítica). */}
            <div
              data-rtls-arrow
              style={{
                position: 'absolute',
                left: '50%',
                bottom: -7,
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop: '8px solid rgba(255, 255, 255, 0.92)',
                filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))',
                pointerEvents: 'none',
              }}
            />
            {/* Badge "ojo" cuando este operario está siendo seguido por la
                cámara. Se mantiene aunque el panel lateral esté cerrado —
                señal persistente de que la cámara está enganchada a este
                tag hasta que el usuario lo des-active explícitamente. */}
            {isFollowing && (
              <div
                title="Cámara siguiendo a este operario"
                style={{
                  position: 'absolute',
                  top: -10,
                  right: -10,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#34c759',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25), 0 0 0 2px #fff',
                  pointerEvents: 'none',
                }}
              >
                {/* SVG ojo abierto — Material-style sin importar el iconpack. */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                </svg>
              </div>
            )}
          </div>
        );
      })}
      {/* Overlay de carga: cubre el visor mientras se descarga la
          plant-view, se carga el XKT (cache miss = ~10s con red lenta;
          parsing/upload-GPU = 5-10s siempre) o se construye la escena.
          Desaparece cuando `modelReady` (model.on('loaded') ya disparó). */}
      {(!plantView || !modelReady) && (
        <Box
          sx={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 2,
            background: 'rgba(255,255,255,0.85)',
            zIndex: 5,
          }}
        >
          <CircularProgress />
          <Box sx={{ fontSize: 13, color: 'text.secondary' }}>
            {!plantView ? 'Cargando vista de planta…' : 'Cargando modelo 3D…'}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default PositioningViewer3D;
