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
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { tagService } from '../../services/tagService';
import { workerService } from '../../services/workerService';
import type { Tag, TagStateValue, CompanyType } from '../../types/tag';
import type { Worker } from '../../types/worker';

interface Props {
  open: boolean;
  serial: string | null;
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

const COMPANY_LABEL: Record<CompanyType, string> = {
  INTERNAL: 'Interno',
  CONTRACTOR: 'Subcontrata',
  VISITOR: 'Visitante',
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
  open, serial, onClose, following = false, onToggleFollow,
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
      // El AppBar es fixed (h=64px) y se queda por encima del drawer si
      // este arranca en top:0 → su cabecera se ocultaría tras el header.
      // Empujamos el panel para que arranque debajo del AppBar.
      PaperProps={{
        sx: {
          top: 64,
          height: 'calc(100% - 64px)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        },
      }}
      sx={{ '& .MuiBackdrop-root': { top: 64 } }}
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
                    label={COMPANY_LABEL[worker.companyType]}
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
                  {following ? 'Dejar de seguir' : 'Seguir en 3D'}
                </Button>
              )}

              {/* Datos del operario (si hay worker) */}
              {worker && (
                <Stack spacing={1.5}>
                  <Typography variant="overline" color="text.secondary">Operario</Typography>
                  <FieldRow
                    icon={<BadgeIcon fontSize="small" />}
                    label="Código"
                    value={<span style={{ fontFamily: 'monospace' }}>{worker.employeeCode}</span>}
                  />
                  {worker.roleInPlant && (
                    <FieldRow
                      icon={<WorkIcon fontSize="small" />}
                      label="Puesto en planta"
                      value={worker.roleInPlant}
                    />
                  )}
                  {worker.phone && (
                    <FieldRow
                      icon={<PhoneIcon fontSize="small" />}
                      label="Teléfono"
                      value={<a href={`tel:${worker.phone}`} style={{ color: 'inherit' }}>{worker.phone}</a>}
                    />
                  )}
                  {worker.email && (
                    <FieldRow
                      icon={<EmailIcon fontSize="small" />}
                      label="Email"
                      value={<a href={`mailto:${worker.email}`} style={{ color: 'inherit' }}>{worker.email}</a>}
                    />
                  )}
                  {worker.hireDate && (
                    <FieldRow
                      icon={<CalendarIcon fontSize="small" />}
                      label="Alta en la empresa"
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
                    <Typography variant="overline" color="text.secondary">Empresa</Typography>
                    <FieldRow
                      icon={<BusinessIcon fontSize="small" />}
                      label={COMPANY_LABEL[worker.companyType]}
                      value={worker.companyName}
                    />
                  </Stack>
                </>
              )}

              {/* Tag asignado */}
              <Divider />
              <Stack spacing={1.5}>
                <Typography variant="overline" color="text.secondary">Tag</Typography>
                <FieldRow
                  icon={<Sensors fontSize="small" />}
                  label="Serial"
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
                  <Typography variant="caption" color="text.secondary" title="Última señal">
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

              {/* Notas del worker */}
              {worker?.notes && (
                <>
                  <Divider />
                  <Stack spacing={1}>
                    <Typography variant="overline" color="text.secondary">Notas</Typography>
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
                  {t('live.unassigned')} — este tag no está asignado a ningún operario.
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
