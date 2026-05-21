// Ficha de tag /tags/:id.
//
// Muestra metadatos del dispositivo (serial, modelo, vendor, firmware, estado,
// batería) y el worker actualmente asignado. Desde aquí se puede:
//   - Asignar el tag a un worker (si está libre)
//   - Desasignarlo (si está ocupado)
//   - Editar metadatos (admin)
//   - Localizar al portador en el visor 3D
//
// Lo invocan: el botón "Ver tag" desde /tags, el enlace del serial en
// WorkerDetail (Resumen) y desde notificaciones de batería baja.

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Button,
  IconButton,
  Tooltip,
  Snackbar,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Memory as ChipIcon,
  Battery90 as BatteryFullIcon,
  BatteryAlert as BatteryAlertIcon,
  AccessTime as TimeIcon,
  MyLocation as LocateIcon,
  Person as PersonIcon,
  PersonOff as PersonOffIcon,
  AddCircleOutline as AssignIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { tagService } from '../../services/tagService';
import { useAuth } from '../../context/AuthContext';
import { TagDialog } from './TagDialog';
import { AssignDialog } from './AssignDialog';
import type { Tag, TagStateValue } from '../../types/tag';

const STATE_LABEL: Record<TagStateValue, string> = {
  ACTIVE: 'Activo',
  IDLE: 'Inactivo',
  LOW_BATTERY: 'Batería baja',
  LOST: 'Perdido',
  UNKNOWN: 'Desconocido',
  DECOMMISSIONED: 'Retirado',
};

const STATE_COLOR: Record<TagStateValue, 'success' | 'default' | 'warning' | 'error' | 'info'> = {
  ACTIVE: 'success',
  IDLE: 'default',
  LOW_BATTERY: 'warning',
  LOST: 'error',
  UNKNOWN: 'default',
  DECOMMISSIONED: 'default',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function TagDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.roles?.includes('ROLE_ADMIN') ?? false, [user]);
  const isOperator = useMemo(
    () => isAdmin || (user?.roles?.includes('ROLE_OPERATOR') ?? false),
    [user, isAdmin],
  );

  const tagId = Number(id);

  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(tagId)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    tagService.getById(tagId)
      .then((t) => { if (!cancelled) setTag(t); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando el tag'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tagId, refreshTick]);

  const handleUnassign = async () => {
    if (!tag) return;
    if (!confirm(`¿Desasignar el tag ${tag.serial} de ${tag.assignedWorkerName ?? '?'}?`)) return;
    setBusy(true);
    try {
      const updated = await tagService.unassign(tag.id);
      setTag(updated);
      setToast({ msg: 'Tag desasignado', sev: 'success' });
    } catch (err) {
      setToast({
        msg: err instanceof Error ? err.message : 'Error al desasignar',
        sev: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!Number.isFinite(tagId)) {
    return <Alert severity="error" sx={{ m: 3 }}>ID de tag inválido.</Alert>;
  }
  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  if (error || !tag) {
    return <Alert severity="error" sx={{ m: 3 }}>{error ?? 'Tag no encontrado'}</Alert>;
  }

  const batteryColor: 'success' | 'warning' | 'error' | 'default' =
    tag.batteryLastPct == null ? 'default'
    : tag.batteryLastPct >= 40 ? 'success'
    : tag.batteryLastPct >= 20 ? 'warning'
    : 'error';

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Paper sx={{ overflow: 'hidden', mb: 3 }}>
        <Box sx={{
          background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
          color: '#fff', p: 3, position: 'relative',
        }}>
          <Tooltip title="Volver al listado">
            <IconButton size="small" onClick={() => navigate('/tags')}
              sx={{ position: 'absolute', top: 12, left: 12, color: '#fff' }}>
              <BackIcon />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Editar tag">
              <IconButton size="small" onClick={() => setEditOpen(true)}
                sx={{ position: 'absolute', top: 12, right: 12, color: '#fff' }}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          )}
          <Stack direction="row" spacing={3} alignItems="center" sx={{ pl: 5, pr: 5 }}>
            <ChipIcon sx={{ fontSize: 64 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.75, letterSpacing: 1 }}>SERIAL</Typography>
              <Typography variant="h4" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                {tag.serial}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip size="small" label={STATE_LABEL[tag.state]} color={STATE_COLOR[tag.state]} />
                <Chip
                  size="small"
                  icon={
                    tag.batteryLastPct != null && tag.batteryLastPct < 20
                      ? <BatteryAlertIcon fontSize="small" />
                      : <BatteryFullIcon fontSize="small" />
                  }
                  label={tag.batteryLastPct != null ? `${tag.batteryLastPct}%` : 'Batería ?'}
                  color={batteryColor}
                  variant="outlined"
                  sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                />
                <Chip
                  size="small"
                  icon={<TimeIcon fontSize="small" />}
                  label={`Visto ${formatDateTime(tag.lastSeenAt)}`}
                  variant="outlined"
                  sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
                />
              </Stack>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ p: 3 }}>
          <Stack direction="row" spacing={4} flexWrap="wrap">
            {/* Dispositivo */}
            <Box sx={{ flex: 1, minWidth: 280 }}>
              <Typography variant="overline" color="text.secondary">Dispositivo</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <DetailRow label="Modelo" value={tag.model ?? '—'} />
                <DetailRow label="Fabricante" value={tag.vendor ?? '—'} />
                <DetailRow label="Firmware" value={tag.firmwareVersion ?? '—'} />
                <DetailRow label="Planta" value={tag.plantId} mono />
                {tag.notes && <DetailRow label="Notas" value={tag.notes} />}
              </Stack>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Asignación */}
            <Box sx={{ flex: 1, minWidth: 280 }}>
              <Typography variant="overline" color="text.secondary">Asignación</Typography>
              {tag.assignedWorkerId ? (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PersonIcon color="primary" />
                    <Box>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                        onClick={() => navigate(`/workers/${tag.assignedWorkerId}`)}
                      >
                        {tag.assignedWorkerName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {tag.assignedWorkerCode}
                        {tag.assignedWorkerCompanyName ? ` · ${tag.assignedWorkerCompanyName}` : ''}
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    Desde {formatDateTime(tag.assignedAt)}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      startIcon={<LocateIcon />}
                      onClick={() => navigate(`/live?focusWorker=${tag.assignedWorkerId}&fly=true`)}
                    >
                      Localizar en 3D
                    </Button>
                    {isOperator && (
                      <Button
                        size="small"
                        color="warning"
                        startIcon={<PersonOffIcon />}
                        onClick={handleUnassign}
                        disabled={busy}
                      >
                        Desasignar
                      </Button>
                    )}
                  </Stack>
                </Stack>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.disabled">
                    Tag sin asignar.
                  </Typography>
                  {isOperator && tag.state !== 'DECOMMISSIONED' && (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AssignIcon />}
                      onClick={() => setAssignOpen(true)}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Asignar a trabajador
                    </Button>
                  )}
                </Stack>
              )}
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Metadatos sistema */}
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="overline" color="text.secondary">Sistema</Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <DetailRow label="ID" value={String(tag.id)} mono />
                <DetailRow label="Alta" value={formatDateTime(tag.createdAt)} />
                <DetailRow label="Última actualización" value={formatDateTime(tag.updatedAt)} />
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Paper>

      {/* Pequeña pista de cómo se enlaza con el resto del sistema */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LinkIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            Este tag aparece en el visor 3D mientras esté asignado a un trabajador con actividad.
            Si pierde batería o no envía señal durante varios minutos, su estado se marcará como
            <em> IDLE </em> o <em> LOST </em> y dejará de pintarse en vivo.
          </Typography>
        </Stack>
      </Paper>

      {/* Diálogos */}
      <TagDialog
        open={editOpen}
        mode="edit"
        initial={tag}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setToast({ msg: 'Tag actualizado', sev: 'success' });
          setRefreshTick((n) => n + 1);
        }}
      />
      <AssignDialog
        open={assignOpen}
        tag={tag}
        onClose={() => setAssignOpen(false)}
        onAssigned={() => {
          setToast({ msg: 'Tag asignado', sev: 'success' });
          setRefreshTick((n) => n + 1);
        }}
      />

      <Snackbar
        open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? <Alert severity={toast.sev}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline">
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: mono ? 'monospace' : undefined }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default TagDetail;
