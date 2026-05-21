import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Stack,
  Paper,
  Alert,
} from '@mui/material';
import {
  ViewInAr as View3DIcon,
  Map as Map2DIcon,
  PlayArrow as LiveIcon,
  History as ReplayIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router-dom';
import { plantViewService } from '../../services/plantViewService';
import { tagService } from '../../services/tagService';
import { positionsStream, type PositionsProvider } from '../../services/positionsStream';
import { proximityStream, type ProximityProvider } from '../../services/proximityStream';
import { CAMERA_FOLLOW_DEFAULTS } from '../../services/userViewPrefsService';
import { useViewPrefs } from '../../hooks/useViewPrefs';
import { useSosStream } from '../../hooks/useSosStream';
import { config } from '../../config/config';
import { PositioningViewer3D } from './PositioningViewer3D';
import { PositioningViewer2D } from './PositioningViewer2D';
import { ReplaySetupDialog } from './ReplaySetupDialog';
import { ReplayBar } from './ReplayBar';
import type { ReplayEventSelection } from './ReplayEventModal';
import { EventDetailModal } from '../../components/EventDetailModal/EventDetailModal';
import type { EventType } from '../../types/eventDetail';
import { useReplayStream } from '../../hooks/useReplayStream';
import type { PlaybackDto } from '../../types/playback';
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

  // ----- Modo Replay -----
  // sourceMode='live' usa el WS; 'replay' usa el PlaybackDto cargado.
  const [sourceMode, setSourceMode] = useState<'live' | 'replay'>('live');
  const [replaySetupOpen, setReplaySetupOpen] = useState(false);
  const [playback, setPlayback] = useState<PlaybackDto | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(5);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [replayEventSelection, setReplayEventSelection] = useState<ReplayEventSelection | null>(null);

  const replayStream = useReplayStream({
    playback,
    playing: replayPlaying,
    speed: replaySpeed,
    currentTimeMs,
    onAdvance: setCurrentTimeMs,
  });

  // El provider que damos al singleton positionsStream NO debe cambiar de
  // identidad en cada render (si lo hiciera, setReplaySource haría notify()
  // cada frame y los hooks suscritos se re-renderizarían sin parar). Lo
  // construimos una vez y, vía una ref a replayStream, mantenemos siempre
  // las funciones más recientes sin reconstruir el provider.
  const replayStreamRef = useRef(replayStream);
  useEffect(() => { replayStreamRef.current = replayStream; }, [replayStream]);

  useEffect(() => {
    if (sourceMode === 'replay' && playback) {
      const provider: PositionsProvider = {
        getTagIds: () => replayStreamRef.current.tagIds,
        getInterpolated: (id) => replayStreamRef.current.getInterpolated(id),
        getLast: (id) => replayStreamRef.current.getLast(id),
      };
      positionsStream.setReplaySource(provider);
    } else {
      positionsStream.setReplaySource(null);
    }
  }, [sourceMode, playback]);

  // Cuando los tagIds del replay cambian (por ejemplo, justo tras montar
  // useReplayStream con un playback nuevo) tenemos que forzar un refresh
  // al singleton: el provider sigue siendo la misma referencia, así que
  // setReplaySource no notifica. Sin esto los visores se quedan con la
  // lista vacía que el hook devolvió en el primer render.
  const replayTagsKey = replayStream.tagIds.join('|');
  useEffect(() => {
    if (sourceMode === 'replay') {
      positionsStream.refresh();
    }
  }, [replayTagsKey, sourceMode]);

  // ----- Provider de proximityStream para colorear zonas durante replay -----
  // Construimos dos sets/maps cacheables: para cada zona o tag activo en el
  // instante actual, devolvemos factor=1.0 (dentro). Si un tag tiene SOS
  // activo, también lo marcamos con factor=1.0 para que el avatar se vea
  // rojo. Se reconstruye cuando cambian los eventos activos.
  const proxFactorMap = useMemo(() => {
    if (!playback) return null;
    // workerId → tagSerial (para mapear proximityEvents → tag).
    const tagByWorker = new Map<number, string>();
    for (const w of playback.workers) tagByWorker.set(w.workerId, w.tagSerial);

    const zoneSet = new Set<number>();
    const tagSet = new Set<string>();
    for (const e of replayStream.activeProximityEvents) {
      zoneSet.add(e.zoneId);
      const serial = tagByWorker.get(e.workerId);
      if (serial) tagSet.add(serial);
    }
    // SOS activos: el tag del worker se pinta rojo aunque no esté en zona.
    for (const s of replayStream.activeSosEvents) {
      const serial = tagByWorker.get(s.workerId);
      if (serial) tagSet.add(serial);
    }
    return { zoneSet, tagSet };
  }, [playback, replayStream.activeProximityEvents, replayStream.activeSosEvents]);

  // Mantenemos los sets actualizados via ref para que el provider sea estable.
  const proxFactorMapRef = useRef(proxFactorMap);
  useEffect(() => { proxFactorMapRef.current = proxFactorMap; }, [proxFactorMap]);

  useEffect(() => {
    if (sourceMode === 'replay' && playback) {
      const provider: ProximityProvider = {
        factorByZone: (id) => (proxFactorMapRef.current?.zoneSet.has(id) ? 1 : 0),
        factorByTag: (serial) => (proxFactorMapRef.current?.tagSet.has(serial) ? 1 : 0),
      };
      proximityStream.setReplaySource(provider);
    } else {
      proximityStream.setReplaySource(null);
    }
  }, [sourceMode, playback]);

  // Cuando los sets cambian (avanza el reloj → activan/desactivan eventos),
  // refresh para que los visores releyan factores.
  useEffect(() => {
    if (sourceMode === 'replay') proximityStream.refresh();
  }, [proxFactorMap, sourceMode]);

  // ----- Set de tagSerials con SOS activo (live + replay) -----
  // El visor 3D lo usa para pintar la etiqueta "SOS" parpadeante sobre el
  // pildora del operario. Live → del WS de SOS. Replay → de activeSosEvents.
  const liveSos = useSosStream(plantId);
  const sosActiveTagIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (sourceMode === 'replay' && playback) {
      const tagByWorker = new Map<number, string>();
      for (const w of playback.workers) tagByWorker.set(w.workerId, w.tagSerial);
      for (const s of replayStream.activeSosEvents) {
        const serial = tagByWorker.get(s.workerId);
        if (serial) set.add(serial);
      }
    } else {
      for (const n of liveSos.active) {
        if (n.tagSerial) set.add(n.tagSerial);
      }
    }
    return set;
  }, [sourceMode, playback, replayStream.activeSosEvents, liveSos.active]);

  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Live se mantiene montado para conservar el viewer xeokit (keep-alive en
  // MainLayout). Pero si el usuario navega a otra ruta queremos que el
  // WorkerInfoPanel se cierre — al volver a /live debería arrancar limpio.
  const location = useLocation();
  useEffect(() => {
    if (location.pathname !== '/live') {
      setPanelOpen(false);
    }
  }, [location.pathname]);
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
  //   ?...&fly=true             → además acerca la cámara una vez (sin follow).
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * Acerca la cámara al tag cuando el viewer y las posiciones estén listas.
   * Hay un retry porque el visor xeokit puede estar todavía cargando el XKT
   * cuando el usuario llega desde otra página con `?fly=true`.
   */
  const flyToTagWhenReady = (serial: string) => {
    const start = Date.now();
    const attempt = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (window as any).__rtlsViewer;
      if (v?.flyToTag) {
        try { v.flyToTag(serial); return; } catch { /* retry */ }
      }
      if (Date.now() - start < 10_000) setTimeout(attempt, 300);
    };
    attempt();
  };

  useEffect(() => {
    const focusTag = searchParams.get('focusTag');
    const focusWorker = searchParams.get('focusWorker');
    const followFlag = searchParams.get('follow') === 'true';
    const flyFlag = searchParams.get('fly') === 'true';
    if (focusTag) {
      setSelectedSerial(focusTag);
      setPanelOpen(true);
      if (followFlag) setFollowingSerial(focusTag);
      if (flyFlag) flyToTagWhenReady(focusTag);
      // Limpia los params para que recargas no reabran el panel.
      searchParams.delete('focusTag');
      searchParams.delete('follow');
      searchParams.delete('fly');
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
              if (flyFlag) flyToTagWhenReady(t.serial);
            }
          })
          .catch(() => { /* ignore */ });
      }
      searchParams.delete('focusWorker');
      searchParams.delete('follow');
      searchParams.delete('fly');
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

  // Per-user preferences (incluye config de cámara para localizar/seguir).
  // Persiste en pos_user_view_pref por (username, plantViewId) con debounce
  // automático — el slider puede moverse libremente sin saturar al backend.
  const { prefs, update: updatePrefs } = useViewPrefs(activeView?.id ?? null);
  const camFollow = useMemo(() => ({
    distance: prefs.cameraFollow?.distance ?? CAMERA_FOLLOW_DEFAULTS.distance,
    azimuthDeg: prefs.cameraFollow?.azimuthDeg ?? CAMERA_FOLLOW_DEFAULTS.azimuthDeg,
    elevationDeg: prefs.cameraFollow?.elevationDeg ?? CAMERA_FOLLOW_DEFAULTS.elevationDeg,
  }), [prefs.cameraFollow]);
  const handleCameraFollowChange = (patch: { distance?: number; azimuthDeg?: number; elevationDeg?: number }) => {
    updatePrefs({ cameraFollow: { ...camFollow, ...patch } });
  };
  const handleCameraFollowReset = () => {
    updatePrefs({ cameraFollow: undefined });
  };

  const handleAvatarClick = (tagId: string) => {
    setSelectedSerial(tagId);
    setPanelOpen(true);
  };

  const handlePlaybackLoaded = (data: PlaybackDto) => {
    setPlayback(data);
    // Arrancamos el reloj en el inicio del rango y pausados — el usuario
    // elige cuándo darle al play.
    setCurrentTimeMs(Date.parse(data.from));
    setReplayPlaying(false);
    setSourceMode('replay');
  };
  const handleExitReplay = () => {
    setSourceMode('live');
    setReplayPlaying(false);
    setPlayback(null);
  };
  const handleRestartReplay = () => {
    if (!playback) return;
    setCurrentTimeMs(Date.parse(playback.from));
    setReplayPlaying(false);
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
        {/* Ajustes del modelo + cámara. La sección de cámara es por usuario
            (cualquier rol); la calibración del modelo solo admin (gating
            interno del propio panel). */}
        {mode === '3d' && activeView && (
          <ModelViewSettingsPanel
            config={modelViewConfig}
            isAdmin={isAdmin}
            onYOffsetChange={handleYOffsetChange}
            onAvatarHeightChange={handleAvatarHeightChange}
            onCaptureView={handleCaptureView}
            onReset={handleResetView}
            cameraFollowDistance={camFollow.distance}
            cameraFollowAzimuthDeg={camFollow.azimuthDeg}
            cameraFollowElevationDeg={camFollow.elevationDeg}
            onCameraFollowChange={handleCameraFollowChange}
            onCameraFollowReset={handleCameraFollowReset}
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

        {/* Toggle Live | Replay — al elegir Replay abrimos el dialog de
            setup; cuando se carga el batch, el visor cambia su fuente. */}
        <ToggleButtonGroup
          value={sourceMode}
          exclusive
          size="small"
          onChange={(_, value) => {
            if (!value) return;
            if (value === 'replay') {
              setReplaySetupOpen(true);  // pedir rango antes de cambiar
            } else {
              handleExitReplay();
            }
          }}
        >
          <ToggleButton value="live">
            <LiveIcon fontSize="small" sx={{ mr: 0.5 }} />
            Live
          </ToggleButton>
          <ToggleButton value="replay">
            <ReplayIcon fontSize="small" sx={{ mr: 0.5 }} />
            Replay
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
              cameraFollowDistance={camFollow.distance}
              cameraFollowAzimuthDeg={camFollow.azimuthDeg}
              cameraFollowElevationDeg={camFollow.elevationDeg}
              sosActiveTagIds={sosActiveTagIds}
            />
          ) : (
            <PositioningViewer2D
              plantId={plantId}
              plantView={activeView}
              onAvatarClick={handleAvatarClick}
              onZoneClick={setZoneDetail}
              sosActiveTagIds={sosActiveTagIds}
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

      {/* Setup del replay: pide rango temporal y duración */}
      <ReplaySetupDialog
        open={replaySetupOpen}
        plantId={plantId}
        onClose={() => setReplaySetupOpen(false)}
        onLoaded={handlePlaybackLoaded}
      />

      {/* Barra de control del replay — solo visible mientras hay un
          playback cargado. Va anclada al pie del área del visor. */}
      {sourceMode === 'replay' && playback && (
        <ReplayBar
          playback={playback}
          playing={replayPlaying}
          speed={replaySpeed}
          currentTimeMs={currentTimeMs}
          currentTimeMsRef={replayStream.currentTimeMsRef}
          onPlayPause={() => {
            // Si está al final y el usuario le da play, reiniciamos al inicio.
            if (currentTimeMs >= Date.parse(playback.to) && !replayPlaying) {
              setCurrentTimeMs(Date.parse(playback.from));
            }
            setReplayPlaying((p) => !p);
          }}
          onSpeedChange={setReplaySpeed}
          onSeek={(ms) => { setReplayPlaying(false); setCurrentTimeMs(ms); }}
          onRestart={handleRestartReplay}
          onExit={handleExitReplay}
          onEventDetail={setReplayEventSelection}
        />
      )}

      {/* Detalle del evento del replay — modal abierto al hacer click en
          el punto gordo de un marker de la timeline. Usamos el modal genérico
          (EventDetailModal) que tira de /v1/events/{type}/{id}, así muestra
          ack/help/resolve/cancel + comentarios + info del tag. */}
      {sourceMode === 'replay' && (
        <EventDetailModal
          selection={replayEventSelection ? {
            type: replayEventSelection.kind === 'PROXIMITY' ? 'PROXIMITY' as EventType : 'SOS' as EventType,
            id: replayEventSelection.event.id,
          } : null}
          onClose={() => setReplayEventSelection(null)}
          onSeek={(ms) => { setReplayPlaying(false); setCurrentTimeMs(ms); }}
        />
      )}
    </Box>
  );
}

export default Live;
