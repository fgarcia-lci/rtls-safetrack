// CriticalSiren — overlay full-screen + audio loop para alertas
// críticas no confirmadas. Es la "alarma roja" que el vigilante NO
// puede ignorar: cubre TODA la pantalla, parpadea rojo, suena un
// siren wail, y pide ACK explícito.
//
// Dispara solo para alertas que cumplen TODAS de:
//   - status abierto (no exitedAt)
//   - sin acknowledgedAt
//   - severity ≥4 OR zoneType=DANGER
//
// Si hay varias críticas concurrentes, mostramos la más reciente. Al
// confirmar, se quita y aparece la siguiente automáticamente.
//
// Como el overlay es modal y bloquea toda la app, el usuario solo puede:
//   1. ACK (silencia esta + revela la siguiente si hay)
//   2. "Ver en 3D" (cierra siren + navega a Live con foco)
//
// Política de autoplay: el AudioContext se desbloquea con el primer
// click/keydown global (gestionado en MainLayout vía unlockAudioContext).
// Si el usuario no ha interactuado nunca con la página y aparece una
// crítica, el overlay visual sale igual; el sonido empieza al primer
// click del usuario en cualquier sitio.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Button, Stack, Avatar, IconButton, Tooltip } from '@mui/material';
import {
  Warning as WarningIcon,
  MyLocation as MyLocationIcon,
  Minimize as MinimizeIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAlertsStream } from '../../hooks/useAlertsStream';
import { startSiren } from '../../services/sirenAudio';
import type { ProximityEvent } from '../../types/zones';

function isCriticalUnacked(ev: ProximityEvent): boolean {
  if (ev.exitedAt) return false;
  if (ev.acknowledgedAt) return false;
  const s = ev.maxSeverity ?? ev.zoneSeverity ?? 0;
  return s >= 4 || ev.zoneType === 'DANGER';
}

interface Props {
  plantId: string;
  onAck: (id: number) => Promise<void>;
}

export function CriticalSiren({ plantId, onAck }: Props) {
  const { t } = useTranslation();
  const { open } = useAlertsStream(plantId);
  const navigate = useNavigate();
  const [acking, setAcking] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const sirenRef = useRef<{ stop: () => void } | null>(null);

  // De entre las críticas no-ACK, la MÁS RECIENTE encabeza el overlay.
  const top = useMemo<ProximityEvent | null>(() => {
    const criticals = open.filter(isCriticalUnacked);
    if (criticals.length === 0) return null;
    return criticals.reduce((latest, ev) =>
      +new Date(ev.enteredAt) > +new Date(latest.enteredAt) ? ev : latest,
    );
  }, [open]);

  // Si llega una crítica NUEVA (id distinto al que teníamos minimizado),
  // desplegamos otra vez automáticamente. Sin esto, una alerta queda
  // silenciada al minimizar y nunca volvería a saltar.
  const lastTopIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (top && top.id !== lastTopIdRef.current) {
      lastTopIdRef.current = top.id;
      setMinimized(false);
    } else if (!top) {
      lastTopIdRef.current = null;
      setMinimized(false);
    }
  }, [top]);

  // Audio: solo en modo expandido. Al minimizar callamos.
  useEffect(() => {
    const shouldPlay = !!top && !minimized;
    if (shouldPlay && !sirenRef.current) {
      sirenRef.current = startSiren();
    } else if (!shouldPlay && sirenRef.current) {
      sirenRef.current.stop();
      sirenRef.current = null;
    }
    return () => {
      if (sirenRef.current) {
        sirenRef.current.stop();
        sirenRef.current = null;
      }
    };
  }, [top, minimized]);

  if (!top) return null;

  const handleAck = async () => {
    setAcking(true);
    try {
      await onAck(top.id);
    } finally {
      setAcking(false);
    }
  };

  const handleLocate = () => {
    if (top.tagSerial) navigate(`/live?focusTag=${top.tagSerial}&follow=true`);
    else if (top.workerId) navigate(`/live?focusWorker=${top.workerId}&follow=true`);
    // Auto-minimizamos para que el vigilante pueda interactuar con el 3D.
    // La alerta sigue activa hasta que se confirme explícitamente.
    setMinimized(true);
  };

  // MODO MINIMIZADO: el overlay desaparece. El badge rojo del icono de
  // alertas en el AppBar sigue indicando que hay críticas sin ACK.
  if (minimized) return null;

  return (
    <Box
      // Backdrop semi-transparente — bloquea interacción con la app
      // mientras la alerta está activa, pero deja ver el contexto detrás.
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 99_999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
      }}
    >
      <Box
        // Card centrada con esquinas redondeadas. Animación de borde +
        // fondo pulsante para mantener el sentido de urgencia sin tapar
        // toda la pantalla.
        sx={{
          position: 'relative',
          width: 'min(640px, 92vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 4,
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          animation: 'rtls-siren-flash 0.7s ease-in-out infinite',
          '@keyframes rtls-siren-flash': {
            '0%, 100%': { backgroundColor: 'rgba(180, 0, 0, 0.92)' },
            '50%': { backgroundColor: 'rgba(255, 30, 30, 0.98)' },
          },
        }}
      >
      {/* Botón minimizar arriba a la derecha — silencia el overlay sin
          confirmar la alerta. El badge rojo del icono de alertas del
          AppBar sigue indicando que hay críticas pendientes. */}
      <Tooltip title={t('alerts.minimizeTooltip')}>
        <IconButton
          onClick={() => setMinimized(true)}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: 'white',
            bgcolor: 'rgba(0,0,0,0.3)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
          }}
          size="small"
        >
          <MinimizeIcon />
        </IconButton>
      </Tooltip>

      <WarningIcon sx={{ fontSize: 80, color: 'white', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }} />

      <Typography
        variant="h3"
        sx={{
          color: 'white',
          fontWeight: 900,
          letterSpacing: 3,
          textAlign: 'center',
          textShadow: '0 4px 16px rgba(0,0,0,0.7)',
        }}
      >
        {t('alerts.criticalTitle')}
      </Typography>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ bgcolor: 'rgba(0,0,0,0.35)', px: 3, py: 1.5, borderRadius: 2, width: '100%' }}>
        <Avatar
          src={top.workerPhotoUrl ?? undefined}
          sx={{
            width: 64,
            height: 64,
            border: 2,
            borderColor: 'white',
            bgcolor: 'rgba(255,255,255,0.15)',
            fontSize: 26,
            flexShrink: 0,
          }}
        >
          {!top.workerPhotoUrl && (top.workerName?.[0] ?? '?')}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ color: 'white', fontWeight: 700 }}>
            {top.workerName ?? `Tag ${top.tagSerial}`}
          </Typography>
          {top.workerCompanyName && (
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.85)' }}>
              {top.workerCompanyName}
              {top.workerRoleInPlant ? ` · ${top.workerRoleInPlant}` : ''}
            </Typography>
          )}
          <Typography variant="h6" sx={{ color: 'white', mt: 0.5 }}>
            {t('alerts.inZone')} <b>{top.zoneName ?? top.zoneCode}</b>
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          color="warning"
          startIcon={<MyLocationIcon />}
          onClick={handleLocate}
          disabled={acking}
          sx={{
            py: 1.25,
            px: 3,
            fontSize: 15,
            fontWeight: 700,
            textTransform: 'none',
          }}
        >
          {t('common.viewIn3D')}
        </Button>
        <Button
          variant="contained"
          onClick={handleAck}
          disabled={acking}
          sx={{
            py: 1.25,
            px: 4,
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: 0.5,
            bgcolor: 'white',
            color: 'error.dark',
            textTransform: 'none',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
          }}
        >
          {acking ? `${t('common.confirm')}…` : t('alerts.ackAndSilence')}
        </Button>
      </Stack>

      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
        {t('alerts.entered', { time: new Date(top.enteredAt).toLocaleTimeString() })}
      </Typography>
      </Box>
    </Box>
  );
}

export default CriticalSiren;
