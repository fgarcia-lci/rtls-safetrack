// Barra inferior del modo Replay del visor Live.
//
// Vive solo cuando hay un PlaybackDto cargado. Controla:
//   - Play/Pause del reloj de reproducción (lo avanza useReplayStream)
//   - Scrubber para saltar a cualquier instante del rango [from, to]
//   - Velocidad de reproducción (1x..100x)
//   - Salir del modo replay y volver al stream live
//
// Encima del slider pintamos marcadores de eventos (proximityEvents + SOS)
// con su color por tipo. Click sobre un marcador hace seek a ese instante.
// El padre (Live.tsx) mantiene el estado `currentTimeMs` y se lo pasa aquí
// para que el slider sea reactivo cuando avanza solo.

import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { Box, IconButton, Slider, ToggleButton, ToggleButtonGroup, Stack, Typography, Tooltip, Button } from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Close as CloseIcon,
  Replay as ReplayIcon,
  SkipPrevious as SkipPrevIcon,
} from '@mui/icons-material';
import type { PlaybackDto, PlaybackProximityEvent, PlaybackSosEvent } from '../../types/playback';
import type { ZoneType } from '../../types/workerHistory';
import type { ReplayEventSelection } from './ReplayEventModal';

interface Props {
  playback: PlaybackDto;
  playing: boolean;
  speed: number;
  currentTimeMs: number;
  /**
   * Ref viva del reloj del replay (se actualiza en cada rAF, sin pasar por
   * React state). Si se pasa, la barra usa su propio loop interno para
   * refrescar el slider visualmente — desacoplado del re-render del padre.
   * Sin esto, en escenas pesadas (visor 3D) React puede no commitear el
   * state a 60 fps y el slider parecería congelado durante el play.
   */
  currentTimeMsRef?: MutableRefObject<number>;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (newTimeMs: number) => void;
  onRestart: () => void;
  onExit: () => void;
  /** Llamado al hacer click en el punto gordo de un marker — abre modal de detalle. */
  onEventDetail: (selection: ReplayEventSelection) => void;
}

const SPEEDS = [1, 5, 20, 100];

// Colores por tipo de marcador — alineados con los del editor de zonas y el
// resto de la UI. SOS gana visualmente sobre todo lo demás (magenta intenso).
const MARKER_COLOR: Record<ZoneType | 'SOS', string> = {
  DANGER: '#e63939',
  RESTRICTED: '#f59f00',
  WARNING: '#f5d51d',
  SAFE: '#34c759',
  INFO: '#3a8ee0',
  SOS: '#d633a8',
};

const MARKER_LABEL: Record<ZoneType | 'SOS', string> = {
  DANGER: 'DANGER',
  RESTRICTED: 'RESTRICTED',
  WARNING: 'WARNING',
  SAFE: 'SAFE',
  INFO: 'INFO',
  SOS: 'SOS',
};

interface TimelineMarker {
  /** Identificador único para key de React. */
  id: string;
  /** Instante de inicio en ms epoch. */
  startMs: number;
  /** Instante de fin (incluido). Si === startMs → marcador puntual. */
  endMs: number;
  kind: ZoneType | 'SOS';
  /** Texto del tooltip — "DANGER · Sala caldera · 14:32–14:35". */
  label: string;
  /** Evento original — se entrega al modal de detalle al hacer click en el punto. */
  source:
    | { kind: 'PROXIMITY'; event: PlaybackProximityEvent }
    | { kind: 'SOS'; event: PlaybackSosEvent };
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString();
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString();
}

function formatDuration(deltaMs: number): string {
  const s = Math.max(0, Math.floor(deltaMs / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function ReplayBar({
  playback, playing, speed, currentTimeMs, currentTimeMsRef,
  onPlayPause, onSpeedChange, onSeek, onRestart, onExit, onEventDetail,
}: Props) {
  const fromMs = Date.parse(playback.from);
  const toMs = Date.parse(playback.to);
  const rangeMs = Math.max(1, toMs - fromMs);

  // Reloj "vivo" para el slider y el timestamp grande. Si tenemos la ref del
  // hook, levantamos un loop local que la lee a 30 fps (más que suficiente
  // para que la barra se vea avanzando suave). Es un setState LOCAL que
  // solo re-renderiza este componente, sin tocar al visor 3D pesado.
  //
  // Importante: cuando playing=true NO sincronizamos desde `currentTimeMs`
  // (state del padre). Ese state puede llegar con varios frames de retraso
  // o incluso retrocedido cuando React coalesce muchos setState seguidos
  // del rAF — si lo aceptáramos, la barra "saltaría hacia atrás" al ritmo
  // de los commits de React. Mientras playing el setInterval es la única
  // fuente; cuando pause/seek el state es fiable y recalibramos.
  const [displayMs, setDisplayMs] = useState(currentTimeMs);
  useEffect(() => {
    if (playing) return;
    setDisplayMs(currentTimeMs);
  }, [currentTimeMs, playing]);
  useEffect(() => {
    if (!playing || !currentTimeMsRef) return;
    const id = window.setInterval(() => {
      setDisplayMs(currentTimeMsRef.current);
    }, 33); // ~30 fps
    return () => window.clearInterval(id);
  }, [playing, currentTimeMsRef]);

  const elapsedMs = Math.max(0, displayMs - fromMs);
  const atEnd = displayMs >= toMs;

  // Calcula los markers a pintar sobre la timeline. Recortamos al rango del
  // playback (un evento puede empezar antes de `from` o terminar después).
  const markers = useMemo<TimelineMarker[]>(() => {
    const out: TimelineMarker[] = [];
    for (const e of playback.proximityEvents) {
      const enter = Math.max(fromMs, Date.parse(e.enteredAt));
      const exit = e.exitedAt ? Math.min(toMs, Date.parse(e.exitedAt)) : enter;
      if (exit < fromMs || enter > toMs) continue;
      const zoneType = (e.zoneType ?? 'INFO') as ZoneType;
      const zone = e.zoneName ?? e.zoneCode ?? `Zone ${e.zoneId}`;
      const label = e.exitedAt
        ? `${MARKER_LABEL[zoneType]} · ${zone} · ${formatTime(enter)}–${formatTime(exit)}`
        : `${MARKER_LABEL[zoneType]} · ${zone} · entró ${formatTime(enter)} (sigue dentro)`;
      out.push({
        id: `prox-${e.id}`,
        startMs: enter,
        endMs: exit,
        kind: zoneType,
        label,
        source: { kind: 'PROXIMITY', event: e },
      });
    }
    for (const s of playback.sosEvents) {
      const trig = Math.max(fromMs, Date.parse(s.triggeredAt));
      const resolved = s.resolvedAt ? Math.min(toMs, Date.parse(s.resolvedAt)) : trig;
      if (resolved < fromMs || trig > toMs) continue;
      out.push({
        id: `sos-${s.id}`,
        startMs: trig,
        endMs: resolved,
        kind: 'SOS',
        label: `SOS · ${formatTime(trig)}${s.resolvedAt ? `–${formatTime(resolved)}` : ' (sin resolver)'}`,
        source: { kind: 'SOS', event: s },
      });
    }
    return out;
  }, [playback, fromMs, toMs]);

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        bgcolor: 'rgba(20, 22, 30, 0.94)',
        color: '#fff',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        px: 2, py: 1.25,
        zIndex: 20,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={2}>
        {/* Salir del replay */}
        <Tooltip title="Volver a Live">
          <IconButton size="small" onClick={onExit} sx={{ color: '#fff' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Restart al inicio */}
        <Tooltip title="Reiniciar al inicio del rango">
          <IconButton size="small" onClick={onRestart} sx={{ color: '#fff' }}>
            <SkipPrevIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Play/Pause */}
        <Tooltip title={playing ? 'Pausar' : 'Reproducir'}>
          <IconButton
            size="medium"
            onClick={onPlayPause}
            sx={{
              color: '#fff',
              bgcolor: 'rgba(255,255,255,0.12)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
            }}
          >
            {playing ? <PauseIcon /> : (atEnd ? <ReplayIcon /> : <PlayIcon />)}
          </IconButton>
        </Tooltip>

        {/* Timestamp actual */}
        <Box sx={{ minWidth: 130 }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, lineHeight: 1.1 }}>
            {formatTime(displayMs)}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.7, fontFamily: 'monospace' }}>
            {formatDate(displayMs)}
          </Typography>
        </Box>

        {/* Slider con timeline de eventos */}
        <Box sx={{ flex: 1, px: 1 }}>
          {/* Wrapper relativo: el slider va dentro y los markers se posicionan
              en absoluto sobre él. */}
          <Box sx={{ position: 'relative' }}>
            {/* Banda de markers de eventos. Para cada evento:
                  - una LÍNEA VERTICAL que atraviesa la track del slider (click = seek)
                  - un PUNTO GORDO en la parte superior (click = abrir modal de detalle)
                  - si tiene duración, una banda horizontal fina del color por debajo.
                El layer es de tamaño suficiente para que el círculo superior
                quede claramente fuera del rail del slider y sea fácil de
                clickar sin interferir con el arrastre del thumb. */}
            <Box
              sx={{
                position: 'absolute',
                left: 0, right: 0,
                top: 0, bottom: 0,
                pointerEvents: 'none', // los elementos hijos rehabilitan pointer events
                zIndex: 1,
              }}
            >
              {markers.map((m) => {
                const startPct = ((m.startMs - fromMs) / rangeMs) * 100;
                const widthPct = Math.max(0, ((m.endMs - m.startMs) / rangeMs) * 100);
                const color = MARKER_COLOR[m.kind];
                const hasDuration = widthPct > 0.4;
                return (
                  <Box key={m.id} sx={{ position: 'absolute', left: `${startPct}%`, top: 0, bottom: 0 }}>
                    {/* Línea vertical: click → seek al instante de inicio */}
                    <Tooltip title={`${m.label} · click para saltar aquí`} arrow placement="bottom">
                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(m.startMs);
                        }}
                        sx={{
                          position: 'absolute',
                          left: 0,
                          top: '8px',
                          bottom: '8px',
                          width: 2,
                          marginLeft: '-1px',
                          bgcolor: color,
                          boxShadow: `0 0 5px ${color}`,
                          pointerEvents: 'auto',
                          cursor: 'pointer',
                          opacity: 0.85,
                          transition: 'opacity 0.15s, width 0.15s',
                          '&:hover': { opacity: 1, width: 3, marginLeft: '-1.5px' },
                        }}
                      />
                    </Tooltip>

                    {/* (La banda horizontal del color para eventos con
                        duración se pinta más abajo, fuera de este wrapper,
                        porque su width necesita ser relativo al rango
                        completo en %, no al wrapper individual del marker.) */}

                    {/* Punto gordo arriba (clickable → modal de detalle).
                        Subido por encima del thumb del slider para que
                        el thumb azul de reproducción no lo tape cuando
                        coincide con un evento. */}
                    <Tooltip
                      title={`${m.label} · click en el punto para ver detalle`}
                      arrow placement="top"
                    >
                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventDetail(m.source);
                        }}
                        sx={{
                          position: 'absolute',
                          left: 0,
                          top: m.kind === 'SOS' ? -9 : -5,
                          width: 14,
                          height: 14,
                          marginLeft: '-7px',
                          bgcolor: color,
                          borderRadius: '50%',
                          border: '2px solid rgba(20,22,30,0.94)',
                          boxShadow: `0 0 6px ${color}`,
                          pointerEvents: 'auto',
                          cursor: 'pointer',
                          transition: 'transform 0.15s',
                          '&:hover': { transform: 'scale(1.35)' },
                        }}
                      />
                    </Tooltip>
                  </Box>
                );
              })}

              {/* Bandas horizontales para duración — separadas para poder usar
                  width en % del contenedor padre directamente, que es lo que
                  representa el rango temporal completo. */}
              {markers.filter((m) => ((m.endMs - m.startMs) / rangeMs) * 100 > 0.4).map((m) => {
                const startPct = ((m.startMs - fromMs) / rangeMs) * 100;
                const widthPct = ((m.endMs - m.startMs) / rangeMs) * 100;
                const color = MARKER_COLOR[m.kind];
                return (
                  <Box
                    key={`band-${m.id}`}
                    sx={{
                      position: 'absolute',
                      left: `${startPct}%`,
                      width: `${widthPct}%`,
                      top: 'calc(50% + 6px)',
                      height: 3,
                      bgcolor: color,
                      opacity: 0.65,
                      borderRadius: 1,
                      pointerEvents: 'none',
                    }}
                  />
                );
              })}
            </Box>

            <Slider
              min={fromMs}
              max={toMs}
              value={Math.min(toMs, Math.max(fromMs, displayMs))}
              // Sin `step` explícito (evita re-disparos de onChange al cuantizar
              // el value controlado). onChangeCommitted hace el seek solo al
              // soltar — durante el drag no interrumpe la reproducción.
              onChangeCommitted={(_, v) => onSeek(typeof v === 'number' ? v : v[0])}
              sx={{
                color: '#42a5f5',
                py: 1.5, // más altura clickable
                '& .MuiSlider-thumb': { width: 14, height: 14, zIndex: 2 },
                '& .MuiSlider-rail': { opacity: 0.4 },
              }}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatTime(typeof v === 'number' ? v : v[0])}
            />
          </Box>

          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" sx={{ opacity: 0.65, fontFamily: 'monospace' }}>
              {formatTime(fromMs)}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.65 }}>
              {formatDuration(elapsedMs)} / {formatDuration(rangeMs)}
              {markers.length > 0 && ` · ${markers.length} eventos`}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.65, fontFamily: 'monospace' }}>
              {formatTime(toMs)}
            </Typography>
          </Stack>
        </Box>

        {/* Velocidad */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={speed}
          onChange={(_, v) => v != null && onSpeedChange(v)}
          sx={{
            '& .MuiToggleButton-root': {
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.25)',
              px: 1.5, py: 0.25,
              minWidth: 0,
              '&.Mui-selected': {
                bgcolor: 'rgba(66,165,245,0.32)',
                color: '#fff',
                '&:hover': { bgcolor: 'rgba(66,165,245,0.42)' },
              },
            },
          }}
        >
          {SPEEDS.map((s) => (
            <ToggleButton key={s} value={s}>
              {s}x
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* CTA pequeño de "Volver a Live" para gente que no se entera del icono. */}
        <Button
          size="small"
          variant="outlined"
          onClick={onExit}
          sx={{
            color: '#fff', borderColor: 'rgba(255,255,255,0.4)',
            '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          Salir
        </Button>
      </Stack>
    </Box>
  );
}

export default ReplayBar;
