// AlertsDrawer — visor de alertas de proximidad. Estructura visual
// alineada con NotificationCenter del DT para que la futura integración
// (cuando RTLS se mergee al DT) sea trivial: mismos componentes MUI,
// mismo layout (drawer derecho 400px, header con bell+badge+WS dot+close,
// tabs Activas/Histórico, lista con avatar de severity, ACK button).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  Badge,
  Chip,
  Button,
  Divider,
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Close as CloseIcon,
  Notifications as NotificationsIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Place as PlaceIcon,
  Schedule as ScheduleIcon,
  PriorityHigh as PriorityHighIcon,
  Business as BusinessIcon,
  MyLocation as MyLocationIcon,
  Badge as BadgeIconMui,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { CompanyType, ProximityEvent, ZoneType } from '../../types/zones';

interface Props {
  open: boolean;
  onClose: () => void;
  openEvents: ProximityEvent[];
  history: ProximityEvent[];
  connected: boolean;
  onAck: (id: number) => Promise<void>;
}

type Severity = 'critical' | 'warning' | 'info';

function severityOf(ev: ProximityEvent): Severity {
  const s = ev.maxSeverity ?? ev.zoneSeverity ?? 3;
  if (s >= 4) return 'critical';
  if (s === 3) return 'warning';
  return 'info';
}

function severityColor(sev: Severity): 'error' | 'warning' | 'info' {
  if (sev === 'critical') return 'error';
  if (sev === 'warning') return 'warning';
  return 'info';
}

function severityIcon(sev: Severity) {
  if (sev === 'critical') return <ErrorIcon fontSize="small" />;
  if (sev === 'warning') return <WarningIcon fontSize="small" />;
  return <InfoIcon fontSize="small" />;
}

// Color de chip por tipo de empresa — alineado con el código de colores de
// las pildoras del visor 3D (verde INTERNAL, azul CONTRACTOR, púrpura VISITOR).
function companyTypeColor(t: CompanyType | null | undefined): 'success' | 'info' | 'secondary' | 'default' {
  if (t === 'INTERNAL') return 'success';
  if (t === 'CONTRACTOR') return 'info';
  if (t === 'VISITOR') return 'secondary';
  return 'default';
}

function zoneTypeChip(zt: ZoneType | null | undefined, t: (k: string) => string) {
  if (!zt) return null;
  const colorMap: Record<ZoneType, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
    DANGER: 'error',
    RESTRICTED: 'warning',
    WARNING: 'warning',
    SAFE: 'success',
    INFO: 'info',
  };
  return <Chip size="small" label={t(`zones.zoneTypeLabel.${zt}`)} color={colorMap[zt]} variant="outlined" />;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

function elapsedSinceEntry(enteredAt: string): number {
  return Math.floor((Date.now() - new Date(enteredAt).getTime()) / 1000);
}

// Tabs alineadas con el patrón del DT (NotificationCenter):
//   0 = NoLeídas → activas sin ACK (las urgentes; matchea el "Unread" del DT)
//   1 = Alertas  → solo severity alta (DANGER/RESTRICTED), open + closed
//   2 = Avisos   → solo severity baja (WARNING/INFO/SAFE), open + closed
//   3 = Todas    → todo el feed
type TabIdx = 0 | 1 | 2 | 3;
type SortMode = 'recent' | 'severity';

// Severities altas (criterio de "Alerta" vs "Aviso"). Se usan también
// para el sort por severidad: cuanto mayor el peso, más arriba aparece.
function severityWeight(ev: ProximityEvent): number {
  const s = ev.maxSeverity ?? ev.zoneSeverity ?? 3;
  return s; // 1..5 (5 = más crítico)
}

function isHighSeverity(ev: ProximityEvent): boolean {
  return severityWeight(ev) >= 4 || ev.zoneType === 'DANGER' || ev.zoneType === 'RESTRICTED';
}

export function AlertsDrawer({
  open, onClose, openEvents, history, connected, onAck,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabIdx>(0);
  const [sort, setSort] = useState<SortMode>('recent');
  const [acking, setAcking] = useState<Set<number>>(new Set());

  // Navegación a Live + foco + follow del operario que disparó la alerta.
  // Cierra el drawer para no tapar el visor 3D.
  const handleLocate = (ev: ProximityEvent) => {
    if (ev.tagSerial) {
      navigate(`/live?focusTag=${ev.tagSerial}&follow=true`);
    } else if (ev.workerId) {
      navigate(`/live?focusWorker=${ev.workerId}&follow=true`);
    }
    onClose();
  };

  // Unifica open + history dedupeando por id (defensivo: el stream
  // backend puede enviar el mismo id en ambos arrays durante el cierre).
  const allEvents = useMemo(() => {
    const map = new Map<number, ProximityEvent>();
    for (const ev of history) map.set(ev.id, ev);
    for (const ev of openEvents) map.set(ev.id, ev); // openEvents prevalece (estado más fresco)
    return Array.from(map.values());
  }, [openEvents, history]);

  const counts = useMemo(() => {
    const unreadN = openEvents.filter((e) => !e.acknowledgedAt).length;
    const alertsN = allEvents.filter(isHighSeverity).length;
    const noticesN = allEvents.filter((e) => !isHighSeverity(e)).length;
    const allN = allEvents.length;
    return { unread: unreadN, alerts: alertsN, notices: noticesN, all: allN };
  }, [openEvents, allEvents]);

  const list = useMemo(() => {
    let filtered: ProximityEvent[];
    switch (tab) {
      case 0: filtered = openEvents.filter((e) => !e.acknowledgedAt); break;
      case 1: filtered = allEvents.filter(isHighSeverity); break;
      case 2: filtered = allEvents.filter((e) => !isHighSeverity(e)); break;
      case 3: default: filtered = allEvents; break;
    }
    // Sort: recent = enteredAt DESC; severity = weight DESC, desempate enteredAt DESC.
    const sorted = [...filtered];
    if (sort === 'recent') {
      sorted.sort((a, b) => +new Date(b.enteredAt) - +new Date(a.enteredAt));
    } else {
      sorted.sort((a, b) => {
        const dw = severityWeight(b) - severityWeight(a);
        return dw !== 0 ? dw : +new Date(b.enteredAt) - +new Date(a.enteredAt);
      });
    }
    return sorted;
  }, [tab, sort, openEvents, allEvents]);

  const handleAck = async (id: number) => {
    setAcking((prev) => new Set(prev).add(id));
    try {
      await onAck(id);
    } finally {
      setAcking((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // Mismo número que el badge de la campana del AppBar (no-ACK abiertas).
  const unread = counts.unread;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // No bloqueante: la vista 3D detrás sigue interactiva mientras
      // el panel está abierto. Mismo patrón que WorkerInfoPanel.
      ModalProps={{
        hideBackdrop: true,
        disableEnforceFocus: true,
        disableAutoFocus: true,
        disableRestoreFocus: true,
      }}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 400 },
          top: 64,
          height: 'calc(100% - 64px)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
          pointerEvents: 'auto',
        },
      }}
      sx={{ pointerEvents: 'none' }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Badge badgeContent={unread} color="error">
              <NotificationsIcon />
            </Badge>
            <Typography variant="h6">{t('alerts.drawerTitle')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* WebSocket connection indicator (igual que el DT) */}
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: connected ? 'success.main' : 'error.main',
              }}
              title={connected ? t('alerts.connected') : t('alerts.disconnected')}
            />
            <IconButton size="small" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Tabs (4) — alineadas con el patrón NotificationCenter del DT.
            Las badges muestran counts en vivo. */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as TabIdx)}
          variant="fullWidth"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: 12, textTransform: 'none' },
          }}
        >
          <Tab
            label={
              <Badge badgeContent={counts.unread} color="error" sx={{ '& .MuiBadge-badge': { right: -10 } }}>
                <span>{t('alerts.tabs.unread')}</span>
              </Badge>
            }
          />
          <Tab
            label={
              <Badge badgeContent={counts.alerts} color="error" sx={{ '& .MuiBadge-badge': { right: -10 } }}>
                <span>{t('alerts.tabs.active')}</span>
              </Badge>
            }
          />
          <Tab
            label={
              <Badge badgeContent={counts.notices} color="warning" sx={{ '& .MuiBadge-badge': { right: -10 } }}>
                <span>{t('alerts.tabs.warnings')}</span>
              </Badge>
            }
          />
          <Tab
            label={
              <Badge badgeContent={counts.all} color="default" sx={{ '& .MuiBadge-badge': { right: -10 } }}>
                <span>{t('alerts.tabs.all')}</span>
              </Badge>
            }
          />
        </Tabs>

        {/* Sort toggle — Recientes | Severidad. Mismo control que el DT. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">{t('alerts.sortBy')}</Typography>
          <ToggleButtonGroup
            value={sort}
            exclusive
            size="small"
            onChange={(_, v) => v && setSort(v as SortMode)}
            sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: 11, textTransform: 'none' } }}
          >
            <ToggleButton value="recent">
              <ScheduleIcon fontSize="inherit" sx={{ fontSize: 14, mr: 0.5 }} />
              {t('alerts.sortRecent')}
            </ToggleButton>
            <ToggleButton value="severity">
              <PriorityHighIcon fontSize="inherit" sx={{ fontSize: 14, mr: 0.5 }} />
              {t('alerts.sortSeverity')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {list.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <NotificationsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                {tab === 0 ? t('alerts.emptyActive') : t('alerts.emptyHistory')}
              </Typography>
            </Box>
          )}

          {list.length > 0 && (
            <List sx={{ p: 0 }}>
              {list.map((ev, idx) => {
                const sev = severityOf(ev);
                const colorName = severityColor(sev);
                const acked = !!ev.acknowledgedAt;
                const isAcking = acking.has(ev.id);
                const isOpen = !ev.exitedAt;
                return (
                  <Box key={ev.id}>
                    <ListItem
                      alignItems="flex-start"
                      sx={{
                        bgcolor: acked || !isOpen ? 'transparent' : 'action.hover',
                        flexDirection: 'column',
                        gap: 1,
                        py: 1.5,
                      }}
                    >
                      <Box sx={{ display: 'flex', width: '100%', gap: 1.5 }}>
                        <ListItemAvatar sx={{ minWidth: 'auto' }}>
                          {/* Avatar = foto del operario (si existe) con un
                              borde del color de la severidad para no perder
                              la señal visual. Si no hay foto, fallback al
                              icono de severidad. */}
                          <Avatar
                            src={ev.workerPhotoUrl ?? undefined}
                            sx={{
                              width: 44,
                              height: 44,
                              bgcolor: `${colorName}.light`,
                              border: 2,
                              borderColor: `${colorName}.main`,
                            }}
                          >
                            {!ev.workerPhotoUrl && severityIcon(sev)}
                          </Avatar>
                        </ListItemAvatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {/* Chips fila — status enriquecido alineado con
                              el modelo del DT (ACTIVE/ACKNOWLEDGED/RESOLVED).
                              Usamos solo 3 estados aquí; ESCALATED/CANCELLED
                              vendrán cuando los modelemos en backend (Bloque B). */}
                          <Box sx={{ display: 'flex', gap: 0.5, mb: 0.75, flexWrap: 'wrap' }}>
                            {zoneTypeChip(ev.zoneType, t)}
                            {isOpen && !acked && (
                              <Chip size="small" label={t('alerts.status.active')} color="error" />
                            )}
                            {isOpen && acked && (
                              <Chip
                                size="small"
                                icon={<CheckCircleIcon fontSize="small" />}
                                label={t('alerts.status.acknowledged')}
                                color="warning"
                                variant="outlined"
                              />
                            )}
                            {!isOpen && (
                              <Chip
                                size="small"
                                icon={<CheckCircleIcon fontSize="small" />}
                                label={t('alerts.status.resolved')}
                                color="success"
                                variant="outlined"
                              />
                            )}
                          </Box>
                          {/* Operario */}
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
                            {ev.workerName ?? ev.tagSerial ?? `Tag ${ev.tagId}`}
                          </Typography>
                          {ev.workerCode && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {ev.workerCode}{ev.tagSerial ? ` · ${ev.tagSerial}` : ''}
                            </Typography>
                          )}
                          {/* Empresa + tipo + rol — mismo código de colores
                              que las pildoras del visor 3D. */}
                          {(ev.workerCompanyName || ev.workerCompanyType) && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                              <BusinessIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {ev.workerCompanyName}
                              </Typography>
                              {ev.workerCompanyType && (
                                <Chip
                                  size="small"
                                  label={ev.workerCompanyType}
                                  color={companyTypeColor(ev.workerCompanyType)}
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: 9, '& .MuiChip-label': { px: 0.75 } }}
                                />
                              )}
                            </Box>
                          )}
                          {ev.workerRoleInPlant && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                              <BadgeIconMui sx={{ fontSize: 12, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {ev.workerRoleInPlant}
                              </Typography>
                            </Box>
                          )}
                          {/* Zona */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                            <PlaceIcon fontSize="inherit" sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {ev.zoneName ?? ev.zoneCode}
                            </Typography>
                          </Box>
                          {/* Time */}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                            {isOpen
                              ? t('alerts.enteredAt', { time: formatTime(ev.enteredAt), duration: formatDuration(elapsedSinceEntry(ev.enteredAt)) })
                              : `${formatTime(ev.enteredAt)} → ${formatTime(ev.exitedAt!)} · ${formatDuration(ev.durationSec ?? 0)}`}
                          </Typography>
                          {/* Bloque de contexto (placeholders por ahora — se
                              llenarán cuando implementemos modulación de
                              severity y DT-integración: vecinos en proximidad,
                              equipos en zona en marcha/parados). */}
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: 0.5, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                              👥 {t('alerts.context.workersNear')}: <em>—</em>
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                              ⚙️ {t('alerts.context.equipmentInZone')}: <em>—</em>
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                              ↻ {t('alerts.context.repeats')}: <em>—</em>
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                      {/* Acciones — siempre visible "Ver en 3D"; ACK solo
                          cuando la alerta está abierta y no confirmada. */}
                      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<MyLocationIcon />}
                          onClick={() => handleLocate(ev)}
                          disabled={!ev.tagSerial && !ev.workerId}
                        >
                          {t('common.viewIn3D')}
                        </Button>
                        {isOpen && !acked && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            disabled={isAcking}
                            onClick={() => handleAck(ev.id)}
                          >
                            {isAcking ? 'ACK…' : 'ACK'}
                          </Button>
                        )}
                      </Box>
                    </ListItem>
                    {idx < list.length - 1 && <Divider />}
                  </Box>
                );
              })}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

export default AlertsDrawer;
