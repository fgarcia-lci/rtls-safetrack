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
import type { PlantView } from './types';

type ViewMode = '3d' | '2d';

export function Live() {
  const { t } = useTranslation();
  const plantId = config.plant.defaultId;

  const [mode, setMode] = useState<ViewMode>('3d');
  const [plantViews, setPlantViews] = useState<PlantView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Seguimiento: si está activo, la cámara del visor 3D persigue al
  // muñequito de este serial. Se puede activar desde WorkerInfoPanel.
  const [followingSerial, setFollowingSerial] = useState<string | null>(null);

  // Localización desde GlobalSearch via query params:
  //   ?focusTag=SERIAL    → abre panel del tag.
  //   ?focusWorker=ID     → resuelve el primer tag del worker y abre panel.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focusTag = searchParams.get('focusTag');
    const focusWorker = searchParams.get('focusWorker');
    if (focusTag) {
      setSelectedSerial(focusTag);
      setPanelOpen(true);
      // Limpia el param para que recargas no reabran el panel.
      searchParams.delete('focusTag');
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
            }
          })
          .catch(() => { /* ignore */ });
      }
      searchParams.delete('focusWorker');
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
              selectedSerial={panelOpen ? selectedSerial : null}
              followingSerial={followingSerial}
            />
          ) : (
            <PositioningViewer2D
              plantId={plantId}
              onAvatarClick={handleAvatarClick}
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
        onClose={() => setPanelOpen(false)}
        following={followingSerial !== null && followingSerial === selectedSerial}
        onToggleFollow={() => {
          setFollowingSerial((prev) =>
            prev === selectedSerial ? null : selectedSerial,
          );
        }}
      />
    </Box>
  );
}

export default Live;
