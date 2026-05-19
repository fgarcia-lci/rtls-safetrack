// SosSiren — overlay full-screen para SOS / petición de pánico.
//
// Dos estados visuales:
//   - EXPANDED: overlay full-screen rojo intermitente con audio + acciones grandes
//   - MINIMIZED: banner persistente arriba (rojo pulsante pero sin audio,
//     no bloquea la app — permite ir al 3D, drawer, etc.)
//
// "Ver en 3D" auto-minimiza para que el vigilante pueda navegar el visor.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Avatar,
  TextField,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Warning as WarningIcon,
  MyLocation as MyLocationIcon,
  CheckCircle as CheckCircleIcon,
  CancelOutlined as CancelIcon,
  Phone as PhoneIcon,
  Minimize as MinimizeIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSosStream } from '../../hooks/useSosStream';
import { sosService } from '../../services/sosService';
import { startSiren } from '../../services/sirenAudio';

interface Props {
  plantId: string;
}

export function SosSiren({ plantId }: Props) {
  const { t } = useTranslation();
  const { active } = useSosStream(plantId);
  const navigate = useNavigate();
  const sirenRef = useRef<{ stop: () => void } | null>(null);
  const [busy, setBusy] = useState<'help' | 'resolve' | 'cancel' | null>(null);
  const [notes, setNotes] = useState('');
  const [minimized, setMinimized] = useState(false);
  // Track del eventId actual para resetear `minimized` cuando llega un SOS NUEVO.
  const lastEventIdRef = useRef<number | null>(null);

  const top = useMemo(() => active[0] ?? null, [active]);

  // Si llega un SOS distinto al actual → restauramos a full-screen.
  // Cualquier SOS nuevo merece la atención inmediata del vigilante.
  useEffect(() => {
    if (top && top.eventId !== lastEventIdRef.current) {
      lastEventIdRef.current = top.eventId;
      setMinimized(false);
    }
    if (!top) {
      lastEventIdRef.current = null;
      setMinimized(false);
    }
  }, [top]);

  // Sirena audio: solo en modo expanded. En minimized se silencia para
  // que el vigilante pueda trabajar sin estar oyendo el wail continuo.
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

  const handleLocate = () => {
    setMinimized(true); // automaticamente minimizamos para ver el 3D
    if (top.tagSerial) navigate(`/live?focusTag=${top.tagSerial}&follow=true`);
    else if (top.workerId) navigate(`/live?focusWorker=${top.workerId}&follow=true`);
  };

  const handleSendHelp = async () => {
    setBusy('help');
    try {
      await sosService.sendHelp(top.eventId, notes || 'Brigada en camino');
      setNotes('');
    } finally { setBusy(null); }
  };

  const handleResolve = async () => {
    setBusy('resolve');
    try {
      await sosService.resolve(top.eventId, notes || 'Situación cerrada, operario a salvo');
      setNotes('');
    } finally { setBusy(null); }
  };

  const handleCancel = async () => {
    setBusy('cancel');
    try {
      await sosService.cancel(top.eventId, notes || 'Falso positivo');
      setNotes('');
    } finally { setBusy(null); }
  };

  // MODO MINIMIZADO: nada en pantalla. El icono 🆘 del AppBar con su
  // badge pulsante actúa como recordatorio. Si llega un SOS nuevo, el
  // useEffect de arriba auto-restaura a full-screen.
  if (minimized) return null;

  // ============ MODO EXPANDED (modal centrado) ============
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 100_000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: 'min(680px, 92vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 4,
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2.5,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          animation: 'rtls-sos-flash 0.45s ease-in-out infinite',
          '@keyframes rtls-sos-flash': {
            '0%, 100%': { backgroundColor: 'rgba(180, 0, 0, 0.95)' },
            '50%': { backgroundColor: 'rgba(255, 30, 30, 1)' },
          },
        }}
      >
      {/* Botón minimizar arriba a la derecha — siempre disponible */}
      <Tooltip title={t('sos.minimizeTooltip')}>
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

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <WarningIcon sx={{ fontSize: 60, color: 'white', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))' }} />
        <Typography
          sx={{
            color: 'white',
            fontWeight: 900,
            letterSpacing: 6,
            fontSize: { xs: 44, md: 64 },
            textShadow: '0 4px 16px rgba(0,0,0,0.7)',
          }}
        >
           SOS
        </Typography>
      </Box>

      <Typography variant="h6" sx={{ color: 'white', textAlign: 'center' }}>
        {t('sos.panicMessage')}
      </Typography>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ bgcolor: 'rgba(0,0,0,0.4)', px: 3, py: 1.5, borderRadius: 2, width: '100%' }}>
        <Avatar
          src={top.workerPhotoUrl ?? undefined}
          sx={{
            width: 64,
            height: 64,
            border: 2,
            borderColor: 'white',
            bgcolor: 'rgba(255,255,255,0.15)',
            fontSize: 28,
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
          {top.workerPhone && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
              <PhoneIcon sx={{ fontSize: 16, color: 'white' }} />
              <Typography variant="body2" sx={{ color: 'white' }}>{top.workerPhone}</Typography>
            </Stack>
          )}
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', mt: 0.5 }}>
            {t('sos.pressedAt')} {new Date(top.triggeredAt).toLocaleTimeString()}
            {top.batteryPct != null ? ` · Batería ${top.batteryPct}%` : ''}
          </Typography>
        </Box>
      </Stack>

      <TextField
        placeholder={t('sos.notesPlaceholder')}
        size="small"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        sx={{
          width: '100%',
          bgcolor: 'rgba(255,255,255,0.92)',
          borderRadius: 1,
        }}
      />

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button
          variant="contained"
          startIcon={<MyLocationIcon />}
          onClick={handleLocate}
          sx={{ py: 1, px: 2.5, fontSize: 14, bgcolor: 'rgba(255,255,255,0.92)', color: 'error.dark', '&:hover': { bgcolor: 'white' } }}
        >
          {t('common.viewIn3D')}
        </Button>
        {top.status === 'REQUESTED' && (
          <Button
            variant="contained"
            color="warning"
            startIcon={<CheckCircleIcon />}
            onClick={handleSendHelp}
            disabled={busy !== null}
            sx={{ py: 1, px: 2.5, fontSize: 14, fontWeight: 700 }}
          >
            {busy === 'help' ? `${t('common.loading')}…` : t('sos.helpOnTheWay')}
          </Button>
        )}
        <Button
          variant="contained"
          color="success"
          startIcon={<CheckCircleIcon />}
          onClick={handleResolve}
          disabled={busy !== null}
          sx={{ py: 1, px: 2.5, fontSize: 14, fontWeight: 700 }}
        >
          {busy === 'resolve' ? `${t('common.loading')}…` : t('sos.workerSafe')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<CancelIcon />}
          onClick={handleCancel}
          disabled={busy !== null}
          sx={{
            py: 1, px: 2.5, fontSize: 13,
            borderColor: 'rgba(255,255,255,0.7)',
            color: 'white',
            '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
          }}
        >
          {t('sos.falsePositive')}
        </Button>
      </Stack>

      {active.length > 1 && (
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
          {t('sos.extraQueued', { count: active.length - 1 })}
        </Typography>
      )}
      </Box>
    </Box>
  );
}

export default SosSiren;
