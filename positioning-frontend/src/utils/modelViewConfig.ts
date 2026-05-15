// Configuración runtime del visor 3D: offset Y del modelo + vista inicial
// (eye + look) + altura avatar. Persistente en BD a nivel de plant_view
// (columnas default_y_offset / default_avatar_height_m / default_camera),
// editable solo por ADMIN. Antes vivía en localStorage por usuario.

export interface ModelViewConfig {
  /** Desplazamiento Y aplicado al modelo (en metros). Negativo = baja. */
  yOffset: number;
  /** Posición de la cámara al cargar (null = usar fly-to default). */
  cameraEye: [number, number, number] | null;
  cameraLook: [number, number, number] | null;
  /** Altura total del avatar (cuerpo + cabeza) en metros. */
  avatarHeightM: number;
}

export const DEFAULT_MODEL_VIEW_CONFIG: ModelViewConfig = {
  yOffset: 0,
  cameraEye: null,
  cameraLook: null,
  avatarHeightM: 2.0,
};

/** Parsea el JSON de defaultCamera ({"eye":[..],"look":[..],"up":[..]}). */
export function parseDefaultCameraJson(
  raw: string | null | undefined,
): { eye: [number, number, number] | null; look: [number, number, number] | null } {
  if (!raw) return { eye: null, look: null };
  try {
    const parsed = JSON.parse(raw) as { eye?: number[]; look?: number[] };
    const eye = Array.isArray(parsed.eye) && parsed.eye.length === 3
      ? (parsed.eye as [number, number, number]) : null;
    const look = Array.isArray(parsed.look) && parsed.look.length === 3
      ? (parsed.look as [number, number, number]) : null;
    return { eye, look };
  } catch {
    return { eye: null, look: null };
  }
}

/** Serializa eye/look al JSON que guarda BD en `default_camera`. */
export function serializeDefaultCamera(
  eye: [number, number, number] | null,
  look: [number, number, number] | null,
): string | null {
  if (!eye && !look) return null;
  return JSON.stringify({ eye, look });
}

/** Build a ModelViewConfig from the calibration fields a PlantView carries. */
export function modelViewConfigFromPlantView(pv: {
  defaultYOffset?: number | null;
  defaultAvatarHeightM?: number | null;
  defaultCamera?: string | null;
} | null | undefined): ModelViewConfig {
  if (!pv) return { ...DEFAULT_MODEL_VIEW_CONFIG };
  const { eye, look } = parseDefaultCameraJson(pv.defaultCamera);
  return {
    yOffset: typeof pv.defaultYOffset === 'number' ? pv.defaultYOffset : DEFAULT_MODEL_VIEW_CONFIG.yOffset,
    cameraEye: eye,
    cameraLook: look,
    avatarHeightM: typeof pv.defaultAvatarHeightM === 'number' && pv.defaultAvatarHeightM > 0
      ? pv.defaultAvatarHeightM
      : DEFAULT_MODEL_VIEW_CONFIG.avatarHeightM,
  };
}
