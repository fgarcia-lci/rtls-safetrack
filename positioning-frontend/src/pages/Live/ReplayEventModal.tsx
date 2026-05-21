// Modal con el detalle de un evento del replay: proximityEvent (entrada en
// zona DANGER/RESTRICTED/etc.) o sosEvent. Reúne toda la info útil para
// el operador / supervisor:
//   - tipo, zona afectada, severity
//   - hora de entrada/salida + duración
//   - operario implicado (foto, nombre, empresa, tag serial)
//   - acciones rápidas: saltar al instante del evento, abrir ficha del operario

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  Chip,
  Avatar,
  Divider,
  Box,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Sos as SosIcon,
  Close as CloseIcon,
  MyLocation as LocateIcon,
  Person as PersonIcon,
  AccessTime as TimeIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type {
  PlaybackDto,
  PlaybackProximityEvent,
  PlaybackSosEvent,
  PlaybackWorker,
} from '../../types/playback';
import type { ZoneType } from '../../types/workerHistory';

export type ReplayEventSelection =
  | { kind: 'PROXIMITY'; event: PlaybackProximityEvent }
  | { kind: 'SOS'; event: PlaybackSosEvent };

interface Props {
  selection: ReplayEventSelection | null;
  playback: PlaybackDto;
  onClose: () => void;
  onSeek: (ms: number) => void;
}

const ZONE_COLOR: Record<ZoneType, string> = {
  DANGER: '#e63939',
  RESTRICTED: '#f59f00',
  WARNING: '#f5d51d',
  SAFE: '#34c759',
  INFO: '#3a8ee0',
};
const ZONE_CHIP_COLOR: Record<ZoneType, 'error' | 'warning' | 'success' | 'info' | 'default'> = {
  DANGER: 'error',
  RESTRICTED: 'warning',
  WARNING: 'warning',
  SAFE: 'success',
  INFO: 'info',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDuration(secs: number | null | undefined): string {
  if (secs == null || secs < 0) return '—';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ${secs % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function ReplayEventModal({ selection, playback, onClose, onSeek }: Props) {
  const navigate = useNavigate();
  if (!selection) return null;

  const workerId = selection.event.workerId;
  const worker: PlaybackWorker | undefined = playback.workers.find((w) => w.workerId === workerId);

  const isSos = selection.kind === 'SOS';
  const eventMs = isSos
    ? Date.parse(selection.event.triggeredAt)
    : Date.parse(selection.event.enteredAt);
  const endMs = isSos
    ? (selection.event.resolvedAt ? Date.parse(selection.event.resolvedAt) : null)
    : (selection.event.exitedAt ? Date.parse(selection.event.exitedAt) : null);

  const titleColor = isSos
    ? '#d633a8'
    : (selection.event.zoneType ? ZONE_COLOR[selection.event.zoneType] : '#888');
  const titleIcon = isSos
    ? <SosIcon sx={{ color: titleColor }} />
    : <WarningIcon sx={{ color: titleColor }} />;
  const titleText = isSos
    ? 'Alarma SOS'
    : `Entrada en zona ${selection.event.zoneType ?? 'desconocida'}`;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      // El backdrop por defecto oscurece el visor — útil aquí porque
      // queremos foco completo en el evento mientras lo estás analizando.
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        {titleIcon}
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>{titleText}</Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(isSos ? selection.event.triggeredAt : selection.event.enteredAt)}
          </Typography>
        </Box>
        <Button size="small" startIcon={<CloseIcon />} onClick={onClose}>
          Cerrar
        </Button>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Trabajador implicado */}
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar src={worker?.photoUrl ?? undefined} sx={{ width: 48, height: 48 }}>
              {initials(worker?.fullName)}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {worker?.fullName ?? `Worker ${workerId}`}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {worker?.employeeCode ?? '—'}
                {worker?.companyName ? ` · ${worker.companyName}` : ''}
                {worker?.tagSerial ? ` · ${worker.tagSerial}` : ''}
              </Typography>
            </Box>
            {workerId && (
              <Button
                size="small"
                startIcon={<PersonIcon />}
                onClick={() => navigate(`/workers/${workerId}`)}
              >
                Ficha
              </Button>
            )}
          </Stack>

          <Divider />

          {/* Datos específicos según tipo de evento */}
          {selection.kind === 'PROXIMITY' && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  label={selection.event.zoneType ?? 'ZONE'}
                  color={selection.event.zoneType ? ZONE_CHIP_COLOR[selection.event.zoneType] : 'default'}
                />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {selection.event.zoneName ?? selection.event.zoneCode ?? `Zone ${selection.event.zoneId}`}
                </Typography>
                {selection.event.zoneCode && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    ({selection.event.zoneCode})
                  </Typography>
                )}
              </Stack>

              <Stack direction="row" spacing={3} flexWrap="wrap">
                <Field label="Entró" value={formatDateTime(selection.event.enteredAt)} />
                <Field
                  label="Salió"
                  value={selection.event.exitedAt
                    ? formatDateTime(selection.event.exitedAt)
                    : 'Aún dentro al final del rango'}
                />
                <Field label="Duración" value={formatDuration(selection.event.durationSec)} />
                {selection.event.severity != null && (
                  <Field label="Severity máx." value={String(selection.event.severity)} />
                )}
              </Stack>
            </Stack>
          )}

          {selection.kind === 'SOS' && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label="SOS" sx={{ bgcolor: '#d633a8', color: '#fff', fontWeight: 700 }} />
                <Chip size="small" label={selection.event.status} variant="outlined" />
              </Stack>
              <Stack direction="row" spacing={3} flexWrap="wrap">
                <Field label="Disparado" value={formatDateTime(selection.event.triggeredAt)} />
                <Field
                  label="Resuelto"
                  value={selection.event.resolvedAt
                    ? formatDateTime(selection.event.resolvedAt)
                    : 'Sin resolver'}
                />
                <Field
                  label="Duración"
                  value={selection.event.resolvedAt
                    ? formatDuration(
                        Math.floor(
                          (Date.parse(selection.event.resolvedAt) - Date.parse(selection.event.triggeredAt)) / 1000,
                        ),
                      )
                    : '—'}
                />
              </Stack>
            </Stack>
          )}

          <Divider />

          {/* Acción rápida: ir a este instante del replay para verlo "en vivo" */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TimeIcon fontSize="small" color="action" />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              Salta el replay al instante en que ocurrió este evento para revisarlo en el visor.
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<LocateIcon />}
              onClick={() => { onSeek(eventMs); onClose(); }}
            >
              Ir al evento
            </Button>
          </Stack>

          {endMs != null && endMs !== eventMs && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <TimeIcon fontSize="small" color="action" />
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                Saltar al cierre del evento.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => { onSeek(endMs); onClose(); }}
              >
                Ir al cierre
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

export default ReplayEventModal;
