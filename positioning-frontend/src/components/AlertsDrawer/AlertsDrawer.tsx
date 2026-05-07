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
} from '@mui/material';
import {
  Close as CloseIcon,
  Notifications as NotificationsIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Place as PlaceIcon,
} from '@mui/icons-material';
import type { ProximityEvent, ZoneType } from '../../types/zones';

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

function zoneTypeChip(t: ZoneType | null | undefined) {
  if (!t) return null;
  const colorMap: Record<ZoneType, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
    DANGER: 'error',
    RESTRICTED: 'warning',
    WARNING: 'warning',
    SAFE: 'success',
    INFO: 'info',
  };
  return <Chip size="small" label={t} color={colorMap[t]} variant="outlined" />;
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

export function AlertsDrawer({
  open, onClose, openEvents, history, connected, onAck,
}: Props) {
  const { t: _t } = useTranslation();
  const [tab, setTab] = useState<0 | 1>(0); // 0=Activas, 1=Histórico
  const [acking, setAcking] = useState<Set<number>>(new Set());

  const list = tab === 0 ? openEvents : history;

  const handleAck = async (id: number) => {
    setAcking((prev) => new Set(prev).add(id));
    try {
      await onAck(id);
    } finally {
      setAcking((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const unread = useMemo(
    () => openEvents.filter((e) => !e.acknowledgedAt).length,
    [openEvents],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // Igual que WorkerInfoPanel: empujamos el panel debajo del AppBar
      // (h=64px) para que su header no quede oculto.
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 400 },
          top: 64,
          height: 'calc(100% - 64px)',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        },
      }}
      sx={{ '& .MuiBackdrop-root': { top: 64 } }}
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
            <Typography variant="h6">Alertas</Typography>
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
              title={connected ? 'Conectado' : 'Desconectado'}
            />
            <IconButton size="small" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as 0 | 1)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            label={
              <Badge badgeContent={openEvents.length} color="error">
                <span style={{ paddingRight: 8 }}>Activas</span>
              </Badge>
            }
            sx={{ flex: 1 }}
          />
          <Tab label="Histórico" sx={{ flex: 1 }} />
        </Tabs>

        {/* List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {list.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <NotificationsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                {tab === 0 ? 'No hay alertas activas' : 'Sin alertas en el histórico'}
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
                          <Avatar sx={{ bgcolor: `${colorName}.light`, width: 36, height: 36 }}>
                            {severityIcon(sev)}
                          </Avatar>
                        </ListItemAvatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {/* Chips fila */}
                          <Box sx={{ display: 'flex', gap: 0.5, mb: 0.75, flexWrap: 'wrap' }}>
                            {zoneTypeChip(ev.zoneType)}
                            {isOpen ? (
                              <Chip size="small" label="ABIERTA" color="error" />
                            ) : (
                              <Chip size="small" label="Cerrada" variant="outlined" />
                            )}
                            {acked && (
                              <Chip
                                size="small"
                                icon={<CheckCircleIcon fontSize="small" />}
                                label="ACK"
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
                            <Typography variant="caption" color="text.secondary">
                              {ev.workerCode} · {ev.tagSerial}
                            </Typography>
                          )}
                          {/* Zona */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                            <PlaceIcon fontSize="inherit" sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              {ev.zoneName ?? ev.zoneCode}
                            </Typography>
                          </Box>
                          {/* Time */}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {isOpen
                              ? `Entró a las ${formatTime(ev.enteredAt)} · ${formatDuration(elapsedSinceEntry(ev.enteredAt))} dentro`
                              : `${formatTime(ev.enteredAt)} → ${formatTime(ev.exitedAt!)} · ${formatDuration(ev.durationSec ?? 0)}`}
                          </Typography>
                        </Box>
                      </Box>
                      {/* Action */}
                      {isOpen && !acked && (
                        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            disabled={isAcking}
                            onClick={() => handleAck(ev.id)}
                          >
                            {isAcking ? 'ACK…' : 'ACK'}
                          </Button>
                        </Box>
                      )}
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
