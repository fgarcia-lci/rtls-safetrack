// Modal genérico de detalle de evento (PROXIMITY o SOS).
//
// Recibe { type, id } y consulta /v1/events/{type}/{id} — así sirve igual
// desde el replay, desde la ficha del trabajador o desde donde haga falta.
// Muestra:
//   - cuerpo del evento + status (incluyendo RESOLVED, CANCELLED FALSE POSITIVE...)
//   - operario implicado con botón a su ficha
//   - tag asociado al evento + batería + estado
//   - ack / help / resolve / cancel: quién, cuándo, notas
//   - lista de comentarios libres + textbox para añadir uno

import { useCallback, useEffect, useState } from 'react';
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
  Alert,
  CircularProgress,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Sos as SosIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Sensors as TagIcon,
  CheckCircle as ResolvedIcon,
  Cancel as CancelledIcon,
  MyLocation as LocateIcon,
  Battery90 as BatteryFullIcon,
  BatteryAlert as BatteryAlertIcon,
  CommentOutlined as CommentIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { eventDetailService } from '../../services/eventDetailService';
import type { EventDetail, EventType } from '../../types/eventDetail';
import type { ZoneType } from '../../types/workerHistory';

interface Props {
  /** Tipo + id del evento a mostrar. null = modal cerrado. */
  selection: { type: EventType; id: number } | null;
  onClose: () => void;
  /** Opcional: si se proporciona, aparecen botones "Ir al evento" / "Ir al cierre". */
  onSeek?: (timeMs: number) => void;
}

const ZONE_COLOR: Record<ZoneType, string> = {
  DANGER: '#e63939',
  RESTRICTED: '#f59f00',
  WARNING: '#f5d51d',
  SAFE: '#34c759',
  INFO: '#3a8ee0',
};
const ZONE_CHIP: Record<ZoneType, 'error' | 'warning' | 'success' | 'info' | 'default'> = {
  DANGER: 'error', RESTRICTED: 'warning', WARNING: 'warning', SAFE: 'success', INFO: 'info',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDuration(secs: number | null): string {
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

/** Mensaje legible del estado de resolución de un SOS. */
function sosStatusLabel(d: EventDetail): { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default'; icon?: React.ReactNode } {
  switch (d.sosStatus) {
    case 'RESOLVED':
      return { label: 'Resuelto · operario a salvo', color: 'success', icon: <ResolvedIcon fontSize="small" /> };
    case 'CANCELLED':
      return { label: 'Cancelado · falso positivo', color: 'default', icon: <CancelledIcon fontSize="small" /> };
    case 'HELP_SENT':
      return { label: 'Ayuda enviada', color: 'info' };
    case 'ACKED':
      return { label: 'Reconocido (en curso)', color: 'warning' };
    case 'REQUESTED':
      return { label: 'Sin atender', color: 'error' };
    default:
      return { label: d.sosStatus ?? '—', color: 'default' };
  }
}

export function EventDetailModal({ selection, onClose, onSeek }: Props) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const reload = useCallback(async () => {
    if (!selection) return;
    setLoading(true);
    setError(null);
    try {
      const d = await eventDetailService.get(selection.type, selection.id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando evento');
    } finally {
      setLoading(false);
    }
  }, [selection]);

  useEffect(() => {
    if (!selection) { setDetail(null); setError(null); setNewComment(''); return; }
    void reload();
  }, [selection, reload]);

  const handlePostComment = async () => {
    if (!selection || !newComment.trim()) return;
    setPosting(true);
    try {
      await eventDetailService.addComment(selection.type, selection.id, newComment.trim());
      setNewComment('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al añadir comentario');
    } finally {
      setPosting(false);
    }
  };

  if (!selection) return null;

  const isSos = selection.type === 'SOS';
  const titleColor = isSos
    ? '#d633a8'
    : (detail?.zoneType ? ZONE_COLOR[detail.zoneType] : '#888');

  const startMs = detail?.startAt ? Date.parse(detail.startAt) : null;
  const endMs = detail?.endAt ? Date.parse(detail.endAt) : null;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        {isSos ? <SosIcon sx={{ color: titleColor }} /> : <WarningIcon sx={{ color: titleColor }} />}
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            {isSos ? 'Alarma SOS' : `Entrada en zona ${detail?.zoneType ?? '—'}`}
          </Typography>
          {detail && (
            <Typography variant="caption" color="text.secondary">
              {formatDateTime(detail.startAt)} {detail.endAt ? `→ ${formatDateTime(detail.endAt)}` : '(sin cierre)'}
              {detail.durationSec != null ? ` · ${formatDuration(detail.durationSec)}` : ''}
            </Typography>
          )}
        </Box>
        <Button size="small" startIcon={<CloseIcon />} onClick={onClose}>Cerrar</Button>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {detail && (
          <Stack spacing={2.5}>
            {/* Status banner para SOS resueltos/cancelados — destacado */}
            {isSos && detail.sosStatus && (() => {
              const s = sosStatusLabel(detail);
              return (
                <Alert
                  severity={s.color === 'success' ? 'success'
                    : s.color === 'error' ? 'error'
                    : s.color === 'warning' ? 'warning'
                    : s.color === 'info' ? 'info' : 'info'}
                  icon={s.icon}
                >
                  {s.label}
                  {detail.cancelReason ? ` — "${detail.cancelReason}"` : ''}
                  {detail.resolutionNotes && detail.sosStatus === 'RESOLVED' ? ` — "${detail.resolutionNotes}"` : ''}
                </Alert>
              );
            })()}

            {/* Worker + tag en una fila — info "quién y con qué tag" */}
            <Stack direction="row" spacing={2}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1 }}>
                <Avatar src={detail.workerPhotoUrl ?? undefined} sx={{ width: 48, height: 48 }}>
                  {initials(detail.workerFullName)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {detail.workerFullName ?? '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {detail.workerEmployeeCode ?? '—'}
                    {detail.workerCompanyName ? ` · ${detail.workerCompanyName}` : ''}
                  </Typography>
                </Box>
                {detail.workerId && (
                  <Tooltip title="Abrir ficha">
                    <Button size="small" startIcon={<PersonIcon />} onClick={() => navigate(`/workers/${detail.workerId}`)}>
                      Ficha
                    </Button>
                  </Tooltip>
                )}
              </Stack>

              <Divider orientation="vertical" flexItem />

              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: 'action.hover', color: 'text.primary' }}>
                  <TagIcon fontSize="small" />
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {detail.tagSerial ?? `Tag ${detail.tagId ?? '—'}`}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                    {detail.tagModel && (
                      <Typography variant="caption" color="text.secondary">{detail.tagModel}</Typography>
                    )}
                    {detail.tagBatteryPct != null && (
                      <Chip
                        size="small"
                        icon={detail.tagBatteryPct < 20 ? <BatteryAlertIcon fontSize="small" /> : <BatteryFullIcon fontSize="small" />}
                        label={`${detail.tagBatteryPct}%`}
                        color={detail.tagBatteryPct < 20 ? 'error' : detail.tagBatteryPct < 40 ? 'warning' : 'success'}
                        variant="outlined"
                        sx={{ height: 20 }}
                      />
                    )}
                    {detail.tagState && (
                      <Chip size="small" label={detail.tagState} variant="outlined" sx={{ height: 20 }} />
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Stack>

            <Divider />

            {/* Datos específicos por tipo */}
            {!isSos && (
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  {detail.zoneType && (
                    <Chip size="small" label={detail.zoneType} color={ZONE_CHIP[detail.zoneType]} />
                  )}
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {detail.zoneName ?? detail.zoneCode ?? '—'}
                  </Typography>
                  {detail.zoneCode && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      ({detail.zoneCode})
                    </Typography>
                  )}
                  {detail.severity != null && (
                    <Chip size="small" label={`Severity ${detail.severity}`} variant="outlined" />
                  )}
                  {detail.authorized === true && (
                    <Chip size="small" label="Autorizado" color="success" variant="outlined" />
                  )}
                  {detail.authorized === false && (
                    <Chip size="small" label="No autorizado" color="error" variant="outlined" />
                  )}
                </Stack>
              </Stack>
            )}

            {/* Acks / ayuda / resolución / cancelación */}
            {(detail.ackedAt || detail.helpSentAt || detail.resolvedAt || detail.cancelledAt) && (
              <Stack spacing={1}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
                  Acciones registradas
                </Typography>
                {detail.ackedAt && (
                  <LifecycleRow label="Reconocido" by={detail.ackedBy} at={detail.ackedAt} />
                )}
                {detail.helpSentAt && (
                  <LifecycleRow label="Ayuda enviada" by={detail.helpSentBy} at={detail.helpSentAt} notes={detail.helpNotes} />
                )}
                {detail.resolvedAt && detail.sosStatus !== 'CANCELLED' && (
                  <LifecycleRow label="Resuelto" by={detail.resolvedBy} at={detail.resolvedAt} notes={detail.resolutionNotes} />
                )}
                {detail.cancelledAt && (
                  <LifecycleRow label="Cancelado (falso positivo)" by={detail.cancelledBy} at={detail.cancelledAt} notes={detail.cancelReason} />
                )}
              </Stack>
            )}

            {/* Acciones rápidas para saltar en el replay */}
            {onSeek && startMs != null && (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" startIcon={<LocateIcon />}
                  onClick={() => { onSeek(startMs); onClose(); }}>
                  Ir al inicio del evento
                </Button>
                {endMs != null && endMs !== startMs && (
                  <Button size="small" variant="outlined"
                    onClick={() => { onSeek(endMs); onClose(); }}>
                    Ir al cierre
                  </Button>
                )}
              </Stack>
            )}

            <Divider />

            {/* Comentarios */}
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CommentIcon fontSize="small" color="action" />
                <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
                  Comentarios ({detail.comments.length})
                </Typography>
              </Stack>

              {detail.comments.length === 0 ? (
                <Typography variant="caption" color="text.disabled">
                  Sin comentarios. Sé el primero en añadir contexto sobre este evento.
                </Typography>
              ) : (
                <Stack spacing={1} divider={<Divider flexItem />}>
                  {detail.comments.map((c) => (
                    <Box key={c.id}>
                      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {c.authorDisplay ?? c.authorUsername}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {formatDateTime(c.createdAt)}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.commentText}</Typography>
                    </Box>
                  ))}
                </Stack>
              )}

              {/* Textbox para añadir comentario */}
              <Stack direction="row" spacing={1} alignItems="flex-end">
                <TextField
                  multiline
                  minRows={2}
                  maxRows={6}
                  fullWidth
                  size="small"
                  placeholder="Añadir un comentario (por ejemplo: 'Era un simulacro', 'Operario formado tras este incidente'...)"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  disabled={posting}
                />
                <Button
                  variant="contained"
                  onClick={handlePostComment}
                  disabled={!newComment.trim() || posting}
                >
                  {posting ? <CircularProgress size={18} /> : 'Publicar'}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

function LifecycleRow({ label, by, at, notes }: {
  label: string; by: string | null; at: string; notes?: string | null;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 1, alignItems: 'baseline' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box>
        <Typography variant="body2">
          {by ?? '—'} <Typography variant="caption" component="span" color="text.disabled">· {formatDateTime(at)}</Typography>
        </Typography>
        {notes && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'pre-wrap' }}>
            "{notes}"
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default EventDetailModal;
