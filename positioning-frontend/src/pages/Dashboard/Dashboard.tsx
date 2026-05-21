// Dashboard de KPIs de seguridad. Se actualiza cada 15s.
//
// Estructura: 4 columnas en desktop · 2 en tablet · 1 en móvil.
//   Fila 1: Plantilla en planta · Alertas hoy · SOS activos · Tags low battery
//   Fila 2: Top zonas conflictivas hoy · Top operarios con incidencias
//   Fila 3: Empresas presentes ahora · Resumen 24h/7d
//
// Estos widgets son la primera impresión al hacer login. Importante que
// las cifras sean cifras de verdad y se actualicen en tiempo real.

import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Stack,
  Avatar,
  Chip,
  LinearProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Group as GroupIcon,
  NotificationsActive as AlertIcon,
  Sos as SosIcon,
  BatteryAlert as BatteryIcon,
  Place as PlaceIcon,
  Business as BusinessIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Refresh as RefreshIcon,
  MyLocation as MyLocationIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardService } from '../../services/dashboardService';
import { config } from '../../config/config';
import type { DashboardSummary } from '../../types/dashboard';

const REFRESH_MS = 15_000;

function formatMttr(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function companyTypeColor(t: string | null): 'success' | 'info' | 'secondary' | 'default' {
  if (t === 'INTERNAL') return 'success';
  if (t === 'CONTRACTOR') return 'info';
  if (t === 'VISITOR') return 'secondary';
  return 'default';
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
  highlight?: boolean;
  onClick?: () => void;
}

function KpiCard({ icon, label, value, sub, color = 'primary', highlight, onClick }: KpiCardProps) {
  return (
    <Paper
      elevation={highlight ? 4 : 1}
      sx={{
        p: 2,
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        bgcolor: highlight ? `${color}.lighter` : 'background.paper',
        transition: 'transform 0.15s',
        '&:hover': onClick ? { transform: 'translateY(-2px)' } : {},
      }}
      onClick={onClick}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ color: `${color}.main`, fontSize: 36, display: 'flex' }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            {label}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" color="text.disabled">
              {sub}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const summary = await dashboardService.getSummary(config.plant.defaultId);
      setData(summary);
      setError(null);
    } catch (err) {
      console.error('[Dashboard] fetch error', err);
      setError(t('dashboard.loadError'));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <Alert severity="error">{error ?? 'Sin datos'}</Alert>
      </Box>
    );
  }

  const occupancyPct = data.workersTotal > 0
    ? Math.round((data.workersActive / data.workersTotal) * 100)
    : 0;

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h4">Dashboard</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {t('common.updatedAt')} {new Date(data.generatedAt).toLocaleTimeString()}
        </Typography>
        <Tooltip title={t('common.refresh')}>
          <IconButton size="small" onClick={fetchData} disabled={refreshing}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Fila 1 — KPIs grandes */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<GroupIcon fontSize="inherit" />}
            label={t('dashboard.kpis.workersOnsite')}
            value={`${data.workersActive} / ${data.workersTotal}`}
            sub={`${occupancyPct}% ocupación`}
            color="primary"
            onClick={() => navigate('/workers')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<AlertIcon fontSize="inherit" />}
            label={t('dashboard.kpis.alertsToday')}
            value={data.alertsToday}
            sub={`${data.alertsLast24h} en 24h · ${data.alertsLast7d} en 7d`}
            color={data.alertsToday > 5 ? 'warning' : 'info'}
            onClick={() => navigate('/events')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<SosIcon fontSize="inherit" />}
            label={t('dashboard.kpis.sosActive')}
            value={data.sosActive}
            sub={`${data.sosToday} disparados hoy`}
            color="error"
            highlight={data.sosActive > 0}
            onClick={() => navigate('/events')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<ScheduleIcon fontSize="inherit" />}
            label={t('dashboard.kpis.mttr')}
            value={formatMttr(data.avgMttrSecondsToday)}
            sub="alertas confirmadas hoy"
            color="success"
          />
        </Grid>
      </Grid>

      {/* Fila 2 — KPIs secundarios */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<BatteryIcon fontSize="inherit" />}
            label={t('dashboard.kpis.lowBatteryTags')}
            value={data.tagsLowBattery}
            sub={`de ${data.tagsTotal} totales`}
            color={data.tagsLowBattery > 0 ? 'warning' : 'success'}
            onClick={() => navigate('/tags')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<MyLocationIcon fontSize="inherit" />}
            label={t('dashboard.kpis.assignedTags')}
            value={`${data.tagsAssigned} / ${data.tagsTotal}`}
            sub="actualmente"
            color="info"
            onClick={() => navigate('/tags')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<BusinessIcon fontSize="inherit" />}
            label={t('dashboard.kpis.companiesOnsite')}
            value={data.companiesPresent.length}
            sub="distintas en planta ahora"
            color="primary"
            onClick={() => navigate('/companies')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard
            icon={<TrendingUpIcon fontSize="inherit" />}
            label={t('dashboard.kpis.workersWithoutTag')}
            value={Math.max(0, data.workersTotal - data.workersWithTag)}
            sub="esperando asignación"
            color="info"
            onClick={() => navigate('/workers')}
          />
        </Grid>
      </Grid>

      {/* Fila 3 — Rankings */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <PlaceIcon color="warning" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('dashboard.topZones')}
              </Typography>
            </Stack>
            {data.topZonesToday.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('dashboard.noZoneEvents')}
              </Typography>
            ) : (
              <Stack spacing={1}>
                {data.topZonesToday.map((z, i) => (
                  <Stack
                    key={z.zoneId}
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    onClick={() => navigate('/zones')}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: i === 0 ? 'warning.lighter' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main', minWidth: 24 }}>
                      #{i + 1}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {z.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {z.code} · {z.type}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${z.eventCount} eventos`}
                      color="warning"
                      size="small"
                      variant={i === 0 ? 'filled' : 'outlined'}
                    />
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <GroupIcon color="error" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('dashboard.topWorkers')}
              </Typography>
            </Stack>
            {data.topWorkersToday.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('dashboard.noWorkerEvents')}
              </Typography>
            ) : (
              <Stack spacing={1}>
                {data.topWorkersToday.map((w, i) => (
                  <Stack
                    key={w.workerId}
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    onClick={() => navigate(`/workers/${w.workerId}`)}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: i === 0 ? 'error.lighter' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main', minWidth: 24 }}>
                      #{i + 1}
                    </Typography>
                    <Avatar
                      src={w.photoUrl ?? undefined}
                      sx={{ width: 36, height: 36, bgcolor: 'error.light' }}
                    >
                      {!w.photoUrl && w.fullName?.[0]}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {w.fullName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {w.employeeCode}{w.companyName ? ` · ${w.companyName}` : ''}
                      </Typography>
                    </Box>
                    {w.companyType && (
                      <Chip
                        label={w.companyType}
                        size="small"
                        color={companyTypeColor(w.companyType)}
                        variant="outlined"
                        sx={{ fontSize: 9, height: 18 }}
                      />
                    )}
                    <Chip
                      label={`${w.eventCount}`}
                      color="error"
                      size="small"
                      variant={i === 0 ? 'filled' : 'outlined'}
                    />
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <BusinessIcon color="primary" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('dashboard.companiesPresent')}
              </Typography>
            </Stack>
            {data.companiesPresent.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('dashboard.noActiveWorkers')}
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {data.companiesPresent.map((c) => (
                  <Chip
                    key={c.companyName}
                    avatar={
                      <Avatar sx={{ bgcolor: `${companyTypeColor(c.companyType)}.main` }}>
                        {c.workersActive}
                      </Avatar>
                    }
                    label={c.companyName}
                    color={companyTypeColor(c.companyType)}
                    variant="outlined"
                    onClick={c.companyId ? () => navigate(`/companies/${c.companyId}`) : undefined}
                    sx={c.companyId ? { cursor: 'pointer' } : undefined}
                  />
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
