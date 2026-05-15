// SosDrawer — drawer lateral con la lista de SOS activos.
// Patrón clonado de AlertsDrawer para coherencia visual.
//
// Acciones disponibles por SOS (según su estado):
//   - REQUESTED: Ver en 3D · Ayuda en camino · A salvo · Falso positivo
//   - ACKED: Ver en 3D · Ayuda en camino · A salvo · Falso positivo
//   - HELP_SENT: Ver en 3D · A salvo · Falso positivo

import { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  Avatar,
  Chip,
  Button,
  Divider,
  Stack,
} from '@mui/material';
import {
  Close as CloseIcon,
  Warning as WarningIcon,
  MyLocation as MyLocationIcon,
  Phone as PhoneIcon,
  CheckCircle as CheckCircleIcon,
  CancelOutlined as CancelIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSosStream } from '../../hooks/useSosStream';
import { sosService } from '../../services/sosService';

interface Props {
  open: boolean;
  onClose: () => void;
  plantId: string;
}

export function SosDrawer({ open, onClose, plantId }: Props) {
  const { t } = useTranslation();
  const { active } = useSosStream(plantId);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Set<number>>(new Set());

  const setBusyId = (id: number, on: boolean) => {
    setBusy((prev) => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  };

  const handleLocate = (sosId: number, tagSerial: string | null | undefined, workerId: number | null | undefined) => {
    if (tagSerial) navigate(`/live?focusTag=${tagSerial}&follow=true`);
    else if (workerId) navigate(`/live?focusWorker=${workerId}&follow=true`);
    onClose();
  };

  const handleSendHelp = async (id: number) => {
    setBusyId(id, true);
    try { await sosService.sendHelp(id); }
    finally { setBusyId(id, false); }
  };
  const handleResolve = async (id: number) => {
    setBusyId(id, true);
    try { await sosService.resolve(id); }
    finally { setBusyId(id, false); }
  };
  const handleCancel = async (id: number) => {
    setBusyId(id, true);
    try { await sosService.cancel(id, 'Falso positivo'); }
    finally { setBusyId(id, false); }
  };

  const statusColor = (s: string): 'error' | 'warning' | 'info' => {
    if (s === 'REQUESTED') return 'error';
    if (s === 'ACKED') return 'warning';
    return 'info';
  };

  const statusLabel = (s: string): string => {
    if (s === 'REQUESTED') return t('sos.status.pending');
    if (s === 'ACKED') return t('sos.status.acknowledged');
    if (s === 'HELP_SENT') return t('sos.status.helpSent');
    return s;
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{
        hideBackdrop: true,
        disableEnforceFocus: true,
        disableAutoFocus: true,
        disableRestoreFocus: true,
      }}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 420 },
          top: 64,
          height: 'calc(100% - 64px)',
          pointerEvents: 'auto',
        },
      }}
      sx={{ pointerEvents: 'none' }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header rojo */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: 'error.main',
            color: 'error.contrastText',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <WarningIcon />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t('sos.drawerTitle')}
            </Typography>
            <Chip
              label={active.length}
              size="small"
              sx={{ bgcolor: 'white', color: 'error.dark', fontWeight: 700 }}
            />
          </Stack>
          <IconButton size="small" onClick={onClose} sx={{ color: 'inherit' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Lista */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {active.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: 'success.light', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                {t('sos.emptyActive')}
              </Typography>
            </Box>
          )}

          {active.length > 0 && (
            <List sx={{ p: 0 }}>
              {active.map((sos, idx) => {
                const isBusy = busy.has(sos.eventId);
                return (
                  <Box key={sos.eventId}>
                    <ListItem
                      alignItems="flex-start"
                      sx={{ flexDirection: 'column', gap: 1, py: 2 }}
                    >
                      <Box sx={{ display: 'flex', width: '100%', gap: 1.5 }}>
                        <Avatar
                          src={sos.workerPhotoUrl ?? undefined}
                          sx={{
                            width: 48, height: 48,
                            border: 2,
                            borderColor: 'error.main',
                            bgcolor: 'error.light',
                          }}
                        >
                          {!sos.workerPhotoUrl && <WarningIcon />}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, flexWrap: 'wrap' }}>
                            <Chip
                              size="small"
                              label={statusLabel(sos.status)}
                              color={statusColor(sos.status)}
                            />
                            {sos.batteryPct != null && sos.batteryPct < 20 && (
                              <Chip size="small" label={`🔋 ${sos.batteryPct}%`} color="warning" variant="outlined" />
                            )}
                          </Stack>
                          <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            {sos.workerName ?? `Tag ${sos.tagSerial}`}
                          </Typography>
                          {sos.workerCompanyName && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {sos.workerCompanyName}
                              {sos.workerRoleInPlant ? ` · ${sos.workerRoleInPlant}` : ''}
                            </Typography>
                          )}
                          {sos.workerPhone && (
                            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                              <PhoneIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {sos.workerPhone}
                              </Typography>
                            </Stack>
                          )}
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                            {t('sos.pressedAt')} {new Date(sos.triggeredAt).toLocaleTimeString()}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Acciones */}
                      <Stack direction="row" spacing={0.5} sx={{ width: '100%', flexWrap: 'wrap' }}>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<MyLocationIcon />}
                          onClick={() => handleLocate(sos.eventId, sos.tagSerial, sos.workerId)}
                          sx={{ fontSize: 11 }}
                        >
                          {t('common.viewIn3D')}
                        </Button>
                        {sos.status !== 'HELP_SENT' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="warning"
                            onClick={() => handleSendHelp(sos.eventId)}
                            disabled={isBusy}
                            sx={{ fontSize: 11 }}
                          >
                            {t('sos.actions.ack')}
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => handleResolve(sos.eventId)}
                          disabled={isBusy}
                          sx={{ fontSize: 11 }}
                        >
                          {t('sos.actions.safe')}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<CancelIcon />}
                          onClick={() => handleCancel(sos.eventId)}
                          disabled={isBusy}
                          sx={{ fontSize: 11 }}
                        >
                          {t('sos.actions.false')}
                        </Button>
                      </Stack>
                    </ListItem>
                    {idx < active.length - 1 && <Divider />}
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

export default SosDrawer;
