// WorkerDetail — ficha completa de un operario para supervisores / admin /
// safety. Página entera (no modal) accesible vía /workers/:id.
//
// Estructura:
//   - Sidebar fija a la izquierda: identidad + estado live + acciones
//   - Tabs a la derecha: Resumen / Histórico / Riesgo / Incidentes
//
// Backend que consume:
//   - GET /v1/workers/{id}            → ficha estática
//   - GET /v1/workers/{id}/history    → posiciones + eventos del rango
//   - GET /v1/workers/{id}/risk-score → score + breakdown
//
// El 3D queda como placeholder en el tab Histórico — la ruta del día se
// pinta sobre un canvas 2D top-down (suficiente para la demo, el 3D lo
// añadimos cuando #110 esté).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Paper,
  Chip,
  Stack,
  Avatar,
  Divider,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Skeleton,
  TextField,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  Badge as BadgeIcon,
  Work as WorkIcon,
  CalendarToday as CalendarIcon,
  MyLocation as LocateIcon,
  Visibility as FollowIcon,
  Warning as WarningIcon,
  School as PrlIcon,
  Map as MapIcon,
  ThreeDRotation as ThreeDIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { workerService } from '../../services/workerService';
import type { Worker } from '../../types/worker';
import type {
  WorkerHistory,
  RiskScore,
  RiskLevel,
  ZoneType,
} from '../../types/workerHistory';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ZONE_TYPE_COLOR: Record<ZoneType, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  DANGER: 'error',
  RESTRICTED: 'warning',
  WARNING: 'warning',
  SAFE: 'success',
  INFO: 'info',
};

const RISK_LEVEL_COLOR: Record<RiskLevel, 'success' | 'info' | 'warning' | 'error'> = {
  LOW: 'success',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
};

const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
  CRITICAL: 'Crítico',
};

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function isPrlExpired(w: Worker): boolean {
  if (!w.lastPrlTrainingDate) return false;
  const last = new Date(w.lastPrlTrainingDate);
  const validUntil = new Date(last);
  validUntil.setMonth(validUntil.getMonth() + (w.prlValidMonths ?? 12));
  return validUntil < new Date();
}

const COMPANY_COLOR: Record<string, string> = {
  INTERNAL: '#34c759',
  CONTRACTOR: '#3a8ee0',
  VISITOR: '#9b5fc7',
};

// -----------------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------------

type TabKey = 'overview' | 'history' | 'risk' | 'incidents';

export function WorkerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t: _t } = useTranslation();

  const workerId = Number(id);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');

  // Carga ficha estática.
  useEffect(() => {
    if (!Number.isFinite(workerId)) return;
    let cancelled = false;
    setLoading(true);
    workerService.getById(workerId)
      .then((w) => { if (!cancelled) setWorker(w); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando trabajador'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workerId]);

  if (!Number.isFinite(workerId)) {
    return <Alert severity="error" sx={{ m: 3 }}>ID de trabajador inválido.</Alert>;
  }
  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  if (error || !worker) {
    return <Alert severity="error" sx={{ m: 3 }}>{error ?? 'Trabajador no encontrado'}</Alert>;
  }

  const headerBg = worker.companyType ? (COMPANY_COLOR[worker.companyType] ?? '#444444') : '#444444';

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ============================ SIDEBAR ============================ */}
      <Box
        sx={{
          width: 320,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        {/* Header con foto + nombre */}
        <Box sx={{
          background: `linear-gradient(135deg, ${headerBg} 0%, ${headerBg}cc 100%)`,
          color: '#fff', p: 2.5, position: 'relative',
        }}>
          <Tooltip title="Volver al listado">
            <IconButton size="small" onClick={() => navigate('/workers')}
              sx={{ position: 'absolute', top: 8, left: 8, color: '#fff' }}>
              <BackIcon />
            </IconButton>
          </Tooltip>
          <Stack alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
            <Avatar src={worker.photoUrl ?? undefined}
              sx={{ width: 96, height: 96, fontSize: 36, fontWeight: 700,
                    border: '3px solid rgba(255,255,255,0.45)',
                    bgcolor: 'rgba(255,255,255,0.18)' }}>
              {initials(worker.fullName)}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
              {worker.fullName}
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" justifyContent="center">
              {worker.companyType && (
                <Chip size="small" label={worker.companyType}
                  sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600, height: 20 }} />
              )}
              {worker.employeeCode && (
                <Typography variant="caption" sx={{ opacity: 0.9, fontFamily: 'monospace' }}>
                  {worker.employeeCode}
                </Typography>
              )}
            </Stack>
            {isPrlExpired(worker) && (
              <Chip
                icon={<WarningIcon sx={{ fontSize: 14 }} />}
                size="small" label="PRL caducado" color="error"
                sx={{ mt: 0.5, fontWeight: 700 }}
              />
            )}
          </Stack>
        </Box>

        {/* Contacto */}
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <SidebarField icon={<BadgeIcon fontSize="small" />} label="Empresa"
            value={worker.companyName} />
          {worker.roleInPlant && (
            <SidebarField icon={<WorkIcon fontSize="small" />} label="Puesto"
              value={worker.roleInPlant} />
          )}
          {worker.phone && (
            <SidebarField icon={<PhoneIcon fontSize="small" />} label="Teléfono"
              value={<a href={`tel:${worker.phone}`} style={{ color: 'inherit' }}>{worker.phone}</a>} />
          )}
          {worker.email && (
            <SidebarField icon={<EmailIcon fontSize="small" />} label="Email"
              value={<a href={`mailto:${worker.email}`} style={{ color: 'inherit' }}>{worker.email}</a>} />
          )}
          {worker.hireDate && (
            <SidebarField icon={<CalendarIcon fontSize="small" />} label="Alta"
              value={new Date(worker.hireDate).toLocaleDateString()} />
          )}
        </Box>

        <Divider />

        {/* PRL */}
        <Box sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary">Formación PRL</Typography>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
            <PrlIcon fontSize="small" color={isPrlExpired(worker) ? 'error' : 'success'} />
            <Box>
              <Typography variant="body2">
                {worker.lastPrlTrainingDate
                  ? new Date(worker.lastPrlTrainingDate).toLocaleDateString()
                  : 'Sin registro'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {worker.lastPrlTrainingDate
                  ? `Válido ${worker.prlValidMonths ?? 12} meses`
                  : 'Pendiente de registrar'}
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Divider />

        {/* Supervisor */}
        {(worker.supervisorName || worker.backupSupervisorName) && (
          <>
            <Box sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">Supervisión</Typography>
              {worker.supervisorName && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <strong>Principal:</strong> {worker.supervisorName}
                </Typography>
              )}
              {worker.backupSupervisorName && (
                <Typography variant="body2">
                  <strong>Backup:</strong> {worker.backupSupervisorName}
                </Typography>
              )}
            </Box>
            <Divider />
          </>
        )}

        {/* Acciones */}
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button fullWidth variant="contained" startIcon={<LocateIcon />}
            onClick={() => navigate(`/live?focusWorker=${worker.id}`)}>
            Localizar en 3D
          </Button>
          <Button fullWidth variant="outlined" startIcon={<FollowIcon />}
            onClick={() => navigate(`/live?focusWorker=${worker.id}&follow=true`)}>
            Seguir en 3D
          </Button>
        </Box>
      </Box>

      {/* ============================ MAIN ============================ */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab value="overview" label="Resumen" />
          <Tab value="history" label="Histórico" />
          <Tab value="risk" label="Perfil de riesgo" />
          <Tab value="incidents" label="Incidentes" />
        </Tabs>
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {tab === 'overview' && <OverviewTab workerId={workerId} />}
          {tab === 'history' && <HistoryTab workerId={workerId} />}
          {tab === 'risk' && <RiskTab workerId={workerId} />}
          {tab === 'incidents' && <IncidentsTab workerId={workerId} />}
        </Box>
      </Box>
    </Box>
  );
}

// -----------------------------------------------------------------------------
// SidebarField helper
// -----------------------------------------------------------------------------

function SidebarField({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
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

// -----------------------------------------------------------------------------
// Tab: Resumen
// -----------------------------------------------------------------------------

function OverviewTab({ workerId }: { workerId: number }) {
  const [risk, setRisk] = useState<RiskScore | null>(null);
  const [history, setHistory] = useState<WorkerHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    Promise.all([
      workerService.getRiskScore(workerId),
      workerService.getHistory(workerId, yesterday.toISOString(), now.toISOString()),
    ])
      .then(([r, h]) => { if (!cancelled) { setRisk(r); setHistory(h); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workerId]);

  if (loading) return <Skeleton variant="rectangular" height={300} />;

  return (
    <Stack spacing={3}>
      <Typography variant="h6">Últimas 24 horas</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
        <KpiCard label="Alertas DANGER" value={history?.counts.dangerEntries ?? 0} color="error" />
        <KpiCard label="Alertas RESTRICTED" value={history?.counts.restrictedEntries ?? 0} color="warning" />
        <KpiCard label="Tiempo en DANGER" value={formatDuration(history?.counts.totalDurationDangerSec ?? 0)} color="error" />
        <KpiCard label="SOS disparados" value={history?.counts.sosCount ?? 0} color="error" />
      </Box>

      {risk && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="overline" color="text.secondary">Score de riesgo (30 días)</Typography>
          <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 1 }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h2" sx={{ fontWeight: 700, lineHeight: 1,
                color: `${RISK_LEVEL_COLOR[risk.level]}.main` }}>
                {risk.normalized.toFixed(1)}
              </Typography>
              <Typography variant="caption" color="text.secondary">/ 10</Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Chip
                label={RISK_LEVEL_LABEL[risk.level]}
                color={RISK_LEVEL_COLOR[risk.level]}
                sx={{ fontWeight: 700, mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                {risk.breakdown.dangerEntries} entradas DANGER · {risk.breakdown.restrictedEntries} RESTRICTED · {risk.breakdown.sosCount} SOS
              </Typography>
              {risk.breakdown.recidivismFactor > 1 && (
                <Typography variant="caption" color="error.main">
                  ↻ Reincidencia detectada (×{risk.breakdown.recidivismFactor})
                </Typography>
              )}
            </Box>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number | string; color: 'error' | 'warning' | 'info' | 'success' }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color: `${color}.main`, mt: 0.5 }}>
        {value}
      </Typography>
    </Paper>
  );
}

// -----------------------------------------------------------------------------
// Tab: Histórico (ruta + heatmap + tabla tiempo en zona)
// -----------------------------------------------------------------------------

function HistoryTab({ workerId }: { workerId: number }) {
  // Por defecto el día de hoy. El usuario puede pedir días anteriores hasta el límite de retención.
  const today = new Date();
  const [dateStr, setDateStr] = useState(today.toISOString().slice(0, 10));
  const [hourRange, setHourRange] = useState<[number, number]>([0, 24]);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [history, setHistory] = useState<WorkerHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromIso = useMemo(() => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setHours(hourRange[0]);
    return d.toISOString();
  }, [dateStr, hourRange]);
  const toIso = useMemo(() => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setHours(hourRange[1]);
    return d.toISOString();
  }, [dateStr, hourRange]);

  const reload = () => {
    setLoading(true);
    setError(null);
    workerService.getHistory(workerId, fromIso, toIso)
      .then(setHistory)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error cargando histórico'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fromIso, toIso, workerId]);

  return (
    <Stack spacing={2}>
      {/* Controles */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField
            type="date" size="small" label="Fecha"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 180 }}
          />
          <Box sx={{ flex: 1, minWidth: 240, px: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Rango horario: {String(hourRange[0]).padStart(2, '0')}:00 → {String(hourRange[1]).padStart(2, '0')}:00
            </Typography>
            <Slider
              value={hourRange}
              onChange={(_, v) => setHourRange(v as [number, number])}
              min={0} max={24} step={1} marks
              valueLabelDisplay="auto"
            />
          </Box>
          <ToggleButtonGroup
            value={viewMode} exclusive size="small"
            onChange={(_, v) => v && setViewMode(v)}
          >
            <ToggleButton value="2d"><MapIcon fontSize="small" sx={{ mr: 0.5 }} />2D</ToggleButton>
            <ToggleButton value="3d"><ThreeDIcon fontSize="small" sx={{ mr: 0.5 }} />3D</ToggleButton>
          </ToggleButtonGroup>
          <IconButton onClick={reload} disabled={loading}><RefreshIcon /></IconButton>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <LinearProgress />}

      {/* Mapa */}
      <Paper sx={{ p: 0, height: 400, overflow: 'hidden', position: 'relative' }}>
        {viewMode === '2d' ? (
          <Path2DCanvas history={history} />
        ) : (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <ThreeDIcon sx={{ fontSize: 64, opacity: 0.3 }} />
            <Typography variant="body1" sx={{ mt: 2 }}>
              Vista 3D — próximamente
            </Typography>
            <Typography variant="caption">
              De momento usa 2D. La ruta sobre el modelo 3D llega en una iteración futura.
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Tabla tiempo en zona */}
      {history && history.timeInZones.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary">Tiempo en zonas</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Zona</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Entradas</TableCell>
                <TableCell align="right">Tiempo dentro</TableCell>
                <TableCell>%</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(() => {
                const maxSecs = history.timeInZones[0]?.secondsInside || 1;
                return history.timeInZones.map((tz) => (
                  <TableRow key={tz.zoneId}>
                    <TableCell>{tz.zoneName ?? tz.zoneCode ?? `Zone ${tz.zoneId}`}</TableCell>
                    <TableCell>
                      {tz.zoneType && (
                        <Chip size="small" label={tz.zoneType} color={ZONE_TYPE_COLOR[tz.zoneType]} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">{tz.entries}</TableCell>
                    <TableCell align="right">{formatDuration(tz.secondsInside)}</TableCell>
                    <TableCell sx={{ width: '30%' }}>
                      <LinearProgress
                        variant="determinate"
                        value={(tz.secondsInside / maxSecs) * 100}
                        sx={{ height: 8, borderRadius: 1 }}
                      />
                    </TableCell>
                  </TableRow>
                ));
              })()}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

/**
 * Canvas 2D top-down de la ruta del trabajador en el rango cargado.
 * Calcula bbox de los puntos y los mapea al canvas con margen.
 */
function Path2DCanvas({ history }: { history: WorkerHistory | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!history || history.positions.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos de posición en el rango', w / 2, h / 2);
      return;
    }

    // bbox
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of history.positions) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const pad = 20;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
    const offsetX = pad + ((w - 2 * pad) - spanX * scale) / 2;
    const offsetY = pad + ((h - 2 * pad) - spanY * scale) / 2;
    const xform = (x: number, y: number) => [offsetX + (x - minX) * scale, offsetY + (maxY - y) * scale];

    // Ruta con gradiente temporal (claro inicio → oscuro final).
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 1; i < history.positions.length; i++) {
      const [x1, y1] = xform(history.positions[i - 1].x, history.positions[i - 1].y);
      const [x2, y2] = xform(history.positions[i].x, history.positions[i].y);
      const t = i / history.positions.length;
      const lightness = 70 - t * 40;  // 70% → 30%
      ctx.strokeStyle = `hsl(210, 80%, ${lightness}%)`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Puntos cada 10 muestras como referencia temporal.
    ctx.fillStyle = '#1976d2';
    history.positions.forEach((p, i) => {
      if (i % 10 !== 0 && i !== history.positions.length - 1) return;
      const [x, y] = xform(p.x, p.y);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Marcador rojo en cada evento DANGER/RESTRICTED para que destaque dónde
    // pasaron las cosas.
    for (const ev of history.proximityEvents) {
      if (ev.zoneType !== 'DANGER' && ev.zoneType !== 'RESTRICTED') continue;
      const entered = new Date(ev.enteredAt).getTime();
      let nearest = history.positions[0];
      let nearestDt = Math.abs(new Date(nearest.ts).getTime() - entered);
      for (const p of history.positions) {
        const dt = Math.abs(new Date(p.ts).getTime() - entered);
        if (dt < nearestDt) { nearest = p; nearestDt = dt; }
      }
      const [x, y] = xform(nearest.x, nearest.y);
      ctx.fillStyle = ev.zoneType === 'DANGER' ? '#e63939' : '#f5b91d';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [history]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// -----------------------------------------------------------------------------
// Tab: Riesgo
// -----------------------------------------------------------------------------

function RiskTab({ workerId }: { workerId: number }) {
  const [risk, setRisk] = useState<RiskScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    workerService.getRiskScore(workerId)
      .then((r) => { if (!cancelled) setRisk(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workerId]);

  if (loading) return <Skeleton variant="rectangular" height={400} />;
  if (!risk) return <Alert severity="info">No hay datos de riesgo en el periodo.</Alert>;

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 4 }}>
        <Stack direction="row" spacing={4} alignItems="center">
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h1" sx={{
              fontWeight: 800, lineHeight: 1,
              color: `${RISK_LEVEL_COLOR[risk.level]}.main`,
              fontSize: 120,
            }}>
              {risk.normalized.toFixed(1)}
            </Typography>
            <Typography variant="body2" color="text.secondary">de 10</Typography>
            <Chip label={RISK_LEVEL_LABEL[risk.level]} color={RISK_LEVEL_COLOR[risk.level]}
              sx={{ mt: 1, fontWeight: 700, fontSize: 14, px: 1 }} />
          </Box>
          <Divider orientation="vertical" flexItem />
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" color="text.secondary">Desglose (30 días)</Typography>
            <BreakdownRow label={`${risk.breakdown.dangerEntries} entradas DANGER`}
              points={risk.breakdown.dangerPoints} color="error" />
            <BreakdownRow label={`${risk.breakdown.restrictedEntries} entradas RESTRICTED`}
              points={risk.breakdown.restrictedPoints} color="warning" />
            <BreakdownRow label={`${risk.breakdown.warningEntries} entradas WARNING`}
              points={risk.breakdown.warningPoints} color="info" />
            <BreakdownRow label={`${risk.breakdown.sosCount} SOS disparados`}
              points={risk.breakdown.sosPoints} color="error" />
            <BreakdownRow label={`${risk.breakdown.minutesInsideDanger} min en zonas DANGER`}
              points={risk.breakdown.dangerTimePoints} color="error" />
            {risk.breakdown.recidivismFactor > 1 && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'error.main' }}>
                Factor de reincidencia ×{risk.breakdown.recidivismFactor} (entró &gt; 3 veces a una misma zona)
              </Typography>
            )}
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2">
              <strong>Score crudo:</strong> {risk.raw.toFixed(1)} puntos · Normalizado contra el percentil 90 de la planta.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {risk.topZones.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary">Zonas más conflictivas</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Zona</TableCell>
                <TableCell align="right">Entradas</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {risk.topZones.map((tz) => (
                <TableRow key={tz.zoneId}>
                  <TableCell>{tz.zoneName ?? tz.zoneCode ?? `Zone ${tz.zoneId}`}</TableCell>
                  <TableCell align="right">{tz.entries}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

function BreakdownRow({ label, points, color }: { label: string; points: number; color: 'error' | 'warning' | 'info' | 'success' }) {
  if (points === 0) return null;
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.25 }}>
      <Typography variant="body2" sx={{ flex: 1 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: `${color}.main`, fontWeight: 600 }}>
        +{points.toFixed(1)}
      </Typography>
    </Stack>
  );
}

// -----------------------------------------------------------------------------
// Tab: Incidentes
// -----------------------------------------------------------------------------

function IncidentsTab({ workerId }: { workerId: number }) {
  const [history, setHistory] = useState<WorkerHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    workerService.getHistory(workerId, start.toISOString(), now.toISOString())
      .then((h) => { if (!cancelled) setHistory(h); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workerId]);

  if (loading) return <Skeleton variant="rectangular" height={300} />;
  if (!history || (history.proximityEvents.length === 0 && history.sosEvents.length === 0)) {
    return <Alert severity="success">Sin incidentes en los últimos 7 días. Todo en orden.</Alert>;
  }

  return (
    <Paper sx={{ p: 0, overflow: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Fecha</TableCell>
            <TableCell>Tipo</TableCell>
            <TableCell>Zona / SOS</TableCell>
            <TableCell align="right">Duración</TableCell>
            <TableCell>Estado</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {history.sosEvents.map((s) => (
            <TableRow key={`sos-${s.id}`}>
              <TableCell>{formatDate(s.triggeredAt)}</TableCell>
              <TableCell><Chip size="small" label="SOS" color="error" /></TableCell>
              <TableCell>—</TableCell>
              <TableCell align="right">
                {s.resolvedAt ? formatDuration((new Date(s.resolvedAt).getTime() - new Date(s.triggeredAt).getTime()) / 1000) : '—'}
              </TableCell>
              <TableCell>{s.status}</TableCell>
            </TableRow>
          ))}
          {history.proximityEvents.slice().reverse().map((e) => (
            <TableRow key={`prox-${e.id}`}>
              <TableCell>{formatDate(e.enteredAt)}</TableCell>
              <TableCell>
                {e.zoneType && (
                  <Chip size="small" label={e.zoneType} color={ZONE_TYPE_COLOR[e.zoneType]} />
                )}
              </TableCell>
              <TableCell>{e.zoneName ?? e.zoneCode ?? `Zone ${e.zoneId}`}</TableCell>
              <TableCell align="right">{formatDuration(e.durationSec)}</TableCell>
              <TableCell>
                {e.exitedAt
                  ? (e.acknowledged ? 'Confirmada / cerrada' : 'Cerrada')
                  : 'Dentro'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}

export default WorkerDetail;
