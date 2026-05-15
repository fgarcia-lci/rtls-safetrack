import { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Drawer,
  IconButton,
  Typography,
  Divider,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';
import {
  Close as CloseIcon,
  BatteryFull,
  Battery60,
  Battery30,
  BatteryAlert,
  Sensors,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  Badge as BadgeIcon,
  Work as WorkIcon,
  CalendarToday as CalendarIcon,
  Notes as NotesIcon,
  Visibility as FollowIcon,
  VisibilityOff as UnfollowIcon,
  Height as HeightIcon,
  PinDrop as PinDropIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { tagService } from '../../services/tagService';
import { workerService } from '../../services/workerService';
import { positionsStream } from '../../services/positionsStream';
import { floorHeightM, formatHeight } from '../../utils/positionHeight';
import type { Tag, TagStateValue, CompanyType } from '../../types/tag';
import type { Worker } from '../../types/worker';
import type { PlantView } from './types';

interface Props {
  open: boolean;
  serial: string | null;
  /** Necesario para calcular altura sobre suelo. */
  plantView?: PlantView | null;
  onClose: () => void;
  /** Estado del seguimiento del operario en el visor 3D. */
  following?: boolean;
  /** Toggle del seguimiento. */
  onToggleFollow?: () => void;
}

const STATE_COLOR: Record<TagStateValue, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  ACTIVE: 'success',
  IDLE: 'info',
  LOW_BATTERY: 'warning',
  LOST: 'error',
  UNKNOWN: 'default',
  DECOMMISSIONED: 'default',
};

const COMPANY_COLOR: Record<CompanyType, string> = {
  INTERNAL: '#34c759',
  CONTRACTOR: '#3a8ee0',
  VISITOR: '#9b5fc7',
};

const COMPANY_TYPE_KEY: Record<CompanyType, string> = {
  INTERNAL: 'workers.companyType.INTERNAL',
  CONTRACTOR: 'workers.companyType.CONTRACTOR',
  VISITOR: 'workers.companyType.VISITOR',
};

function batteryIcon(pct?: number | null) {
  if (pct == null) return <BatteryAlert color="disabled" />;
  if (pct >= 75) return <BatteryFull color="success" />;
  if (pct >= 40) return <Battery60 color="success" />;
  if (pct >= 20) return <Battery30 color="warning" />;
  return <BatteryAlert color="error" />;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return 'now';
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

interface FieldRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function FieldRow({ icon, label, value }: FieldRowProps) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box sx={{ color: 'action.active', mt: 0.25 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.1 }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value}</Typography>
      </Box>
    </Stack>
  );
}

export function WorkerInfoPanel({
  open, serial, plantView = null, onClose, following = false, onToggleFollow,
}: Props) {
  const { t } = useTranslation();
  const [tag, setTag] = useState<Tag | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !serial) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTag(null);
    setWorker(null);

    (async () => {
      try {
        const t1 = await tagService.getBySerial(serial);
        if (cancelled) return;
        setTag(t1);
        if (t1.assignedWorkerId) {
          const w = await workerService.getById(t1.assignedWorkerId);
          if (cancelled) return;
          setWorker(w);
        }
      } catch (err) {
        if (cancelled) return;
        const e = err as { response?: { status?: number } };
        setError(e.response?.status === 404 ? t('live.tagNotFound') : t('common.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, serial, t]);

  // Posición del operario: altura sobre el suelo + coords X/Y en la
  // fábrica. Polling cada 1s desde el singleton de positionsStream —
  // basta con esa frecuencia, no es un valor crítico que necesite
  // 30 fps.
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number; z: number } | null>(null);
  useEffect(() => {
    if (!open || !serial) { setCurrentPos(null); return; }
    const update = () => {
      const last = positionsStream.getLast(serial);
      setCurrentPos(last ? { x: last.x, y: last.y, z: last.z } : null);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [open, serial]);
  const heightOverFloor = currentPos !== null ? floorHeightM(plantView, currentPos.z) : null;

  // Color del header según tipo de empleado. Sin worker → gris oscuro.
  // Importante: hex de 6 dígitos para que el sufijo `cc` del gradiente
  // (alpha 80%) sea CSS válido (#444 + cc = #444cc inválido).
  const headerBg = worker
    ? COMPANY_COLOR[worker.companyType]
    : '#444444';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // - PaperProps top:64 → debajo del AppBar fixed.
      // - hideBackdrop + pointerEvents:none en el Modal root → la vista
      //   3D detrás sigue interactiva (drag, zoom, click en muñequito).
      //   El paper sí captura events (auto) para sus propios clicks.
      // - disableEnforceFocus / disableAutoFocus → no roba el focus al
      //   visor (que necesita keyboard + ratón para orbit/pan).
      ModalProps={{
        hideBackdrop: true,
        disableEnforceFocus: true,
        disableAutoFocus: true,
        disableRestoreFocus: true,
        keepMounted: false,
      }}
      PaperProps={{
        sx: {
          top: 64,
          height: 'calc(100% - 64px)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
          pointerEvents: 'auto',
        },
      }}
      sx={{
        pointerEvents: 'none',
      }}
    >
      <Box sx={{ width: 380, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Cabecera con avatar + nombre + chip tipo. Color por companyType. */}
        <Box
          sx={{
            background: `linear-gradient(135deg, ${headerBg} 0%, ${headerBg}cc 100%)`,
            color: '#fff',
            p: 2,
            position: 'relative',
          }}
        >
          <IconButton
            onClick={onClose}
            size="small"
            sx={{ position: 'absolute', top: 8, right: 8, color: '#fff' }}
          >
            <CloseIcon />
          </IconButton>

          <Stack direction="row" spacing={2} alignItems="center" sx={{ pr: 4 }}>
            <Avatar
              src={worker?.photoUrl ?? undefined}
              sx={{
                width: 56,
                height: 56,
                bgcolor: 'rgba(255,255,255,0.18)',
                fontSize: 22,
                fontWeight: 700,
                border: '2px solid rgba(255,255,255,0.4)',
              }}
            >
              {worker ? initialsOf(worker.fullName) : '?'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2, wordBreak: 'break-word' }}>
                {worker?.fullName ?? t('live.unassigned')}
              </Typography>
              {worker && (
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={t(COMPANY_TYPE_KEY[worker.companyType])}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.25)',
                      color: '#fff',
                      fontWeight: 600,
                      height: 20,
                    }}
                  />
                  {worker.employeeCode && (
                    <Typography variant="caption" sx={{ opacity: 0.9, fontFamily: 'monospace' }}>
                      {worker.employeeCode}
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {loading && (
            <Box sx={{ textAlign: 'center', mt: 4 }}><CircularProgress /></Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          {!loading && !error && tag && (
            <Stack spacing={2.5}>
              {/* Acciones rápidas */}
              {onToggleFollow && (
                <Button
                  fullWidth
                  variant={following ? 'contained' : 'outlined'}
                  color={following ? 'success' : 'primary'}
                  startIcon={following ? <UnfollowIcon /> : <FollowIcon />}
                  onClick={onToggleFollow}
                >
                  {following ? t('live.unfollow') : t('live.follow')}
                </Button>
              )}

              {/* Demo: disparar SOS como si lo hubiera pulsado el operario.
                  Solo para demos sin hardware real. */}
              {tag.serial && (
                <Button
                  fullWidth
                  variant="contained"
                  color="error"
                  size="large"
                  sx={{ fontWeight: 700, letterSpacing: 2 }}
                  onClick={async () => {
                    if (!confirm(t('live.sosSimulateConfirm'))) return;
                    try {
                      const { sosService } = await import('../../services/sosService');
                      await sosService.simulate(tag.serial);
                    } catch (err) {
                      console.error('SOS simulate error', err);
                      alert(t('live.sosSimulateError'));
                    }
                  }}
                >
                  {t('live.sosSimulateButton')}
                </Button>
              )}

              {/* Datos del operario (si hay worker) */}
              {worker && (
                <Stack spacing={1.5}>
                  <Typography variant="overline" color="text.secondary">{t('live.workerSection')}</Typography>
                  <FieldRow
                    icon={<BadgeIcon fontSize="small" />}
                    label={t('live.fields.employeeCode')}
                    value={<span style={{ fontFamily: 'monospace' }}>{worker.employeeCode}</span>}
                  />
                  {worker.roleInPlant && (
                    <FieldRow
                      icon={<WorkIcon fontSize="small" />}
                      label={t('live.fields.roleInPlant')}
                      value={worker.roleInPlant}
                    />
                  )}
                  {worker.phone && (
                    <FieldRow
                      icon={<PhoneIcon fontSize="small" />}
                      label={t('live.fields.phone')}
                      value={<a href={`tel:${worker.phone}`} style={{ color: 'inherit' }}>{worker.phone}</a>}
                    />
                  )}
                  {worker.email && (
                    <FieldRow
                      icon={<EmailIcon fontSize="small" />}
                      label={t('live.fields.email')}
                      value={<a href={`mailto:${worker.email}`} style={{ color: 'inherit' }}>{worker.email}</a>}
                    />
                  )}
                  {worker.hireDate && (
                    <FieldRow
                      icon={<CalendarIcon fontSize="small" />}
                      label={t('live.fields.hireDate')}
                      value={new Date(worker.hireDate).toLocaleDateString()}
                    />
                  )}
                </Stack>
              )}

              {/* Empresa */}
              {worker && (
                <>
                  <Divider />
                  <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">{t('live.companySection')}</Typography>
                    <FieldRow
                      icon={<BusinessIcon fontSize="small" />}
                      label={t(COMPANY_TYPE_KEY[worker.companyType])}
                      value={worker.companyName}
                    />
                  </Stack>
                </>
              )}

              {/* Tag asignado */}
              <Divider />
              <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">{t('live.tagSection')}</Typography>
                <FieldRow
                  icon={<Sensors fontSize="small" />}
                  label={t('tags.columns.serial')}
                  value={<span style={{ fontFamily: 'monospace' }}>{tag.serial}</span>}
                />
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small"
                    label={t(`tags.state.${tag.state}`)}
                    color={STATE_COLOR[tag.state]}
                  />
                  {batteryIcon(tag.batteryLastPct)}
                  <Typography variant="body2" color="text.secondary">
                    {tag.batteryLastPct != null ? `${tag.batteryLastPct}%` : '—'}
                  </Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Typography variant="caption" color="text.secondary" title={t('tags.columns.lastSeen')}>
                    {relativeTime(tag.lastSeenAt)}
                  </Typography>
                </Stack>
                {(tag.vendor || tag.model) && (
                  <Typography variant="caption" color="text.secondary" sx={{ pl: 4.5 }}>
                    {[tag.vendor, tag.model].filter(Boolean).join(' / ')}
                    {tag.firmwareVersion && ` · fw ${tag.firmwareVersion}`}
                  </Typography>
                )}
              </Stack>

              {/* Posición — altura sobre el suelo + coords X/Y en la
                  fábrica. Crítico en vistas 2D para distinguir si el
                  operario está en planta baja, subido a una pasarela,
                  o en otro nivel. */}
              {currentPos !== null && (
                <>
                  <Divider />
                  <Stack spacing={1.5}>
                    <Typography variant="overline" color="text.secondary">{t('live.positionSection')}</Typography>
                    {heightOverFloor !== null ? (
                      <FieldRow
                        icon={<HeightIcon fontSize="small" />}
                        label={t('live.heightOverFloor')}
                        value={formatHeight(heightOverFloor)}
                      />
                    ) : (
                      <FieldRow
                        icon={<HeightIcon fontSize="small" />}
                        label={t('live.heightZ')}
                        value={formatHeight(currentPos.z)}
                      />
                    )}
                    <FieldRow
                      icon={<PinDropIcon fontSize="small" />}
                      label={t('live.coordsXY')}
                      value={
                        <span style={{ fontFamily: 'monospace' }}>
                          {currentPos.x.toFixed(1)} , {currentPos.y.toFixed(1)}
                        </span>
                      }
                    />
                  </Stack>
                </>
              )}

              {/* Notas del worker */}
              {worker?.notes && (
                <>
                  <Divider />
                  <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">{t('live.notesSection')}</Typography>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <NotesIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {worker.notes}
                      </Typography>
                    </Stack>
                  </Stack>
                </>
              )}

              {/* Tag sin worker asignado */}
              {!worker && tag.assignedWorkerId == null && (
                <Alert severity="info" variant="outlined">
                  {t('live.tagWithoutWorker')}
                </Alert>
              )}
            </Stack>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

export default WorkerInfoPanel;
