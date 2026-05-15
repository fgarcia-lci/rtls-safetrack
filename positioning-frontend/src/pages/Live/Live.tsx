import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Stack,
  Paper,
  Alert,
} from '@mui/material';
import { ViewInAr as View3DIcon, Map as Map2DIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { plantViewService } from '../../services/plantViewService';
import { tagService } from '../../services/tagService';
import { config } from '../../config/config';
import { PositioningViewer3D } from './PositioningViewer3D';
import { PositioningViewer2D } from './PositioningViewer2D';
import { LayersPanel } from './LayersPanel';
import { WorkerInfoPanel } from './WorkerInfoPanel';
import { ZoneDetailModal } from '../../components/ZoneDetailModal/ZoneDetailModal';
import { ModelViewSettingsPanel } from '../../components/ModelViewSettings/ModelViewSettingsPanel';
import { ModelTreePanel } from '../../components/ModelTreePanel/ModelTreePanel';
import {
  modelViewConfigFromPlantView,
  serializeDefaultCamera,
  type ModelViewConfig,
} from '../../utils/modelViewConfig';
import { useAuth } from '../../context/AuthContext';
import type { PlantView } from './types';
import type { SafetyZone } from '../../types/zones';

type ViewMode = '3d' | '2d';

export function Live() {
  const { t } = useTranslation();
  const plantId = config.plant.defaultId;
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.roles?.includes('ROLE_ADMIN') ?? false, [user]);

  const [mode, setMode] = useState<ViewMode>('3d');
  const [plantViews, setPlantViews] = useState<PlantView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Zona seleccionada para mostrar en el modal de detalle (#52). Se setea
  // al hacer click en una zona en el visor 2D o 3D.
  const [zoneDetail, setZoneDetail] = useState<SafetyZone | null>(null);
  // Seguimiento: si está activo, la cámara del visor 3D persigue al
  // muñequito de este serial. Se puede activar desde WorkerInfoPanel.
  const [followingSerial, setFollowingSerial] = useState<string | null>(null);

  // Localización desde GlobalSearch / lista de Workers via query params:
  //   ?focusTag=SERIAL          → abre panel del tag.
  //   ?focusWorker=ID           → resuelve primer tag del worker y abre panel.
  //   ?...&follow=true          → además activa modo seguimiento de cámara.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focusTag = searchParams.get('focusTag');
    const focusWorker = searchParams.get('focusWorker');
    const followFlag = searchParams.get('follow') === 'true';
    if (focusTag) {
      setSelectedSerial(focusTag);
      setPanelOpen(true);
      if (followFlag) setFollowingSerial(focusTag);
      // Limpia los params para que recargas no reabran el panel.
      searchParams.delete('focusTag');
      searchParams.delete('follow');
      setSearchParams(searchParams, { replace: true });
    } else if (focusWorker) {
      const workerId = Number(focusWorker);
      if (Number.isFinite(workerId)) {
        // Buscar primer tag de este worker en la planta y abrir panel.
        tagService.list({ plantId, isAssigned: true, size: 200 })
          .then((page) => {
            const t = page.content.find((tg) => tg.assignedWorkerId === workerId);
            if (t) {
              setSelectedSerial(t.serial);
              setPanelOpen(true);
              if (followFlag) setFollowingSerial(t.serial);
            }
          })
          .catch(() => { /* ignore */ });
      }
      searchParams.delete('focusWorker');
      searchParams.delete('follow');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Cargar plant-views al montar
  useEffect(() => {
    plantViewService.listForPlant(plantId)
      .then(setPlantViews)
      .catch(() => setError(t('common.error')));
  }, [plantId, t]);

  // Por ahora seleccionamos el primer 3D disponible
  const activeView = useMemo(
    () => plantViews.find((v) => v.type === 'MODEL_3D') ?? plantViews[0] ?? null,
    [plantViews],
  );

  // Estado de visibilidad de layers — inicializado desde defaultVisible
  const [layersVisible, setLayersVisible] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!activeView) return;
    const initial: Record<string, boolean> = {};
    for (const l of activeView.layers) initial[l.code] = l.defaultVisible;
    setLayersVisible(initial);
  }, [activeView]);

  const handleToggleLayer = (code: string, visible: boolean) => {
    setLayersVisible((prev) => ({ ...prev, [code]: visible }));
  };

  // Modelo de calibración del visor. Vive en state local para que tocar
  // un slider NO cambie la identidad de `activeView` (si lo hiciera, el
  // viewer recargaría el modelo y se perderían cosas como los nodos
  // ocultos del TreeView). La persistencia al backend ocurre por separado.
  const [modelViewConfig, setModelViewConfig] = useState<ModelViewConfig>(
    () => modelViewConfigFromPlantView(activeView),
  );
  useEffect(() => {
    setModelViewConfig(modelViewConfigFromPlantView(activeView));
    // Sólo reaccionamos al cambio de plant-view (identidad por id),
    // no a actualizaciones internas — la calibración se guarda en BD
    // pero se aplica localmente sin reconstruir activeView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id]);

  const applyCalibration = (patch: {
    defaultYOffset?: number;
    defaultAvatarHeightM?: number;
    defaultCamera?: string | null;
  }) => {
    if (!activeView) return;
    setModelViewConfig((prev) => ({
      yOffset: patch.defaultYOffset ?? prev.yOffset,
      avatarHeightM: patch.defaultAvatarHeightM ?? prev.avatarHeightM,
      cameraEye: patch.defaultCamera !== undefined
        ? (patch.defaultCamera ? JSON.parse(patch.defaultCamera).eye ?? null : null)
        : prev.cameraEye,
      cameraLook: patch.defaultCamera !== undefined
        ? (patch.defaultCamera ? JSON.parse(patch.defaultCamera).look ?? null : null)
        : prev.cameraLook,
    }));
    plantViewService.updateCalibration(activeView.id, {
      defaultYOffset: patch.defaultYOffset,
      defaultAvatarHeightM: patch.defaultAvatarHeightM,
      defaultCamera: patch.defaultCamera,
    }).catch((err) => {
      console.error('[Live] updateCalibration failed', err);
    });
  };

  const handleYOffsetChange = (value: number) => applyCalibration({ defaultYOffset: value });
  const handleAvatarHeightChange = (value: number) => applyCalibration({ defaultAvatarHeightM: value });
  const handleCaptureView = () => {
    const v = (window as unknown as { __rtlsViewer?: { scene: { camera: { eye: number[]; look: number[] } } } }).__rtlsViewer;
    if (!v) return;
    const eye = Array.from(v.scene.camera.eye) as [number, number, number];
    const look = Array.from(v.scene.camera.look) as [number, number, number];
    applyCalibration({ defaultCamera: serializeDefaultCamera(eye, look) });
  };
  const handleResetView = () => {
    applyCalibration({ defaultYOffset: 0, defaultAvatarHeightM: 2.0, defaultCamera: null });
  };

  const handleAvatarClick = (tagId: string) => {
    setSelectedSerial(tagId);
    setPanelOpen(true);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="h5">{t('navigation.live')}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        {/* Botón de ajustes del modelo a la izquierda del toggle 3D/2D —
            despliega un Popover con offset Y, altura muñequitos, etc. */}
        {mode === '3d' && activeView && isAdmin && (
          <ModelViewSettingsPanel
            config={modelViewConfig}
            onYOffsetChange={handleYOffsetChange}
            onAvatarHeightChange={handleAvatarHeightChange}
            onCaptureView={handleCaptureView}
            onReset={handleResetView}
          />
        )}
        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_, value) => value && setMode(value)}
        >
          <ToggleButton value="3d">
            <View3DIcon fontSize="small" sx={{ mr: 0.5 }} />
            3D
          </ToggleButton>
          <ToggleButton value="2d">
            <Map2DIcon fontSize="small" sx={{ mr: 0.5 }} />
            2D
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

      <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex' }}>
        <Box sx={{ flexGrow: 1, position: 'relative', minHeight: 0 }}>
          {mode === '3d' ? (
            <PositioningViewer3D
              plantId={plantId}
              plantView={activeView}
              layersVisible={layersVisible}
              onAvatarClick={handleAvatarClick}
              onZoneClick={setZoneDetail}
              selectedSerial={panelOpen ? selectedSerial : null}
              followingSerial={followingSerial}
              modelYOffset={modelViewConfig.yOffset}
              initialCameraEye={modelViewConfig.cameraEye}
              initialCameraLook={modelViewConfig.cameraLook}
              avatarHeightM={modelViewConfig.avatarHeightM}
            />
          ) : (
            <PositioningViewer2D
              plantId={plantId}
              plantView={activeView}
              onAvatarClick={handleAvatarClick}
              onZoneClick={setZoneDetail}
            />
          )}
        </Box>

        {/* Layers panel flotante a la derecha (solo si hay >1 layer) */}
        {mode === '3d' && activeView && activeView.layers.length > 1 && (
          <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
            <LayersPanel
              plantView={activeView}
              visibility={layersVisible}
              onToggle={handleToggleLayer}
            />
          </Box>
        )}

        {/* Árbol jerárquico de visibilidad del modelo — solo modo 3D */}
        {mode === '3d' && activeView && (
          <ModelTreePanel plantViewId={activeView.id} />
        )}

        {/* Indicador "esperando datos" cuando no hay activeView */}
        {!activeView && !error && (
          <Box sx={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Paper sx={{ p: 3 }}>
              <Typography color="text.secondary">{t('live.noView')}</Typography>
            </Paper>
          </Box>
        )}
      </Box>

      <WorkerInfoPanel
        open={panelOpen}
        serial={selectedSerial}
        plantView={activeView}
        onClose={() => setPanelOpen(false)}
        following={followingSerial !== null && followingSerial === selectedSerial}
        onToggleFollow={() => {
          setFollowingSerial((prev) =>
            prev === selectedSerial ? null : selectedSerial,
          );
        }}
      />

      {/* Modal de detalle de zona (#52) — se abre al hacer click sobre
          una zona en cualquier visor. */}
      <ZoneDetailModal zone={zoneDetail} onClose={() => setZoneDetail(null)} />
    </Box>
  );
}

export default Live;
