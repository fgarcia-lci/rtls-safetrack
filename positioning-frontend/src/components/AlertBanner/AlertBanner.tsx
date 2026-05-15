// AlertBanner — toasts flotantes top-right para alertas nuevas.
//
// Patrón clonado del Digital Twin (`AlertBanner.tsx:31-335`). Se monta a
// nivel del layout y escucha al alertsStream singleton. Cada vez que
// llega una alerta NUEVA (entrada tras el mount), añade un toast a la
// pila con auto-dismiss según severidad:
//
//   - critical (DANGER, severity ≥4): 12s
//   - warning  (RESTRICTED, WARNING, severity 3): 8s
//   - info     (resto): 5s
//
// Las alertas pre-existentes al mount no se muestran (las ve el
// usuario en el AlertsDrawer). Solo nuevas para no spam al cargar.
//
// Click en "Ver en 3D" navega a Live + foco. ACK directo desde el toast.
// El toast cierra al hacer ACK o al expirar.
//
// Nota: las alertas CRÍTICAS se gestionan también con CriticalSiren
// (overlay full-screen). El banner aquí sirve para WARNING/INFO y para
// dar respaldo visual a las críticas que el usuario silencia rápido.

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  IconButton,
  Typography,
  Avatar,
  Chip,
  Button,
  Stack,
} from '@mui/material';
import {
  Close as CloseIcon,
  MyLocation as MyLocationIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Place as PlaceIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAlertsStream } from '../../hooks/useAlertsStream';
import type { ProximityEvent } from '../../types/zones';

type SevCat = 'critical' | 'warning' | 'info';

const DURATION_BY_SEV: Record<SevCat, number> = {
  critical: 12_000,
  warning: 8_000,
  info: 5_000,
};

function sevCategory(ev: ProximityEvent): SevCat {
  const s = ev.maxSeverity ?? ev.zoneSeverity ?? 3;
  if (s >= 4 || ev.zoneType === 'DANGER') return 'critical';
  if (s === 3 || ev.zoneType === 'RESTRICTED' || ev.zoneType === 'WARNING') return 'warning';
  return 'info';
}

function sevColor(c: SevCat): 'error' | 'warning' | 'info' {
  return c === 'critical' ? 'error' : c === 'warning' ? 'warning' : 'info';
}

function sevIcon(c: SevCat) {
  if (c === 'critical') return <ErrorIcon />;
  if (c === 'warning') return <WarningIcon />;
  return <InfoIcon />;
}

interface BannerToast {
  ev: ProximityEvent;
  expiresAt: number;
}

interface Props {
  plantId: string;
  onAck: (id: number) => Promise<void>;
}

export function AlertBanner({ plantId, onAck }: Props) {
  const { t } = useTranslation();
  const { open: openEvents } = useAlertsStream(plantId);
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<BannerToast[]>([]);
  const [acking, setAcking] = useState<Set<number>>(new Set());
  const seenRef = useRef<Set<number>>(new Set());
  const mountTimeRef = useRef(Date.now());

  // Snapshot inicial: marcar como "vistas" todas las alertas pre-existentes
  // en el primer render para no mostrarlas como toasts (ya están en el
  // drawer; el banner es solo para NOVEDADES).
  const firstRenderRef = useRef(true);
  if (firstRenderRef.current) {
    for (const ev of openEvents) seenRef.current.add(ev.id);
    firstRenderRef.current = false;
  }

  // Detectar nuevas alertas y añadir toasts.
  useEffect(() => {
    const now = Date.now();
    let added = false;
    const next: BannerToast[] = [];
    for (const ev of openEvents) {
      if (seenRef.current.has(ev.id)) continue;
      seenRef.current.add(ev.id);
      // Filtro defensivo: solo alertas posteriores al mount + 5s de margen
      // (cubre desfase reloj cliente/servidor en el snapshot inicial).
      const enteredAt = +new Date(ev.enteredAt);
      if (enteredAt < mountTimeRef.current - 5000) continue;

      const dur = DURATION_BY_SEV[sevCategory(ev)];
      next.push({ ev, expiresAt: now + dur });
      added = true;
    }
    if (added) setToasts((prev) => [...next, ...prev]); // nuevos arriba
  }, [openEvents]);

  // Tick de auto-dismiss.
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.expiresAt > now));
    }, 500);
    return () => clearInterval(id);
  }, [toasts.length]);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.ev.id !== id));
  };

  const handleAck = async (id: number) => {
    setAcking((prev) => new Set(prev).add(id));
    try {
      await onAck(id);
      dismiss(id);
    } finally {
      setAcking((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleLocate = (ev: ProximityEvent) => {
    if (ev.tagSerial) navigate(`/live?focusTag=${ev.tagSerial}&follow=true`);
    else if (ev.workerId) navigate(`/live?focusWorker=${ev.workerId}&follow=true`);
    dismiss(ev.id);
  };

  if (toasts.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 80,
        right: 16,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxWidth: 380,
        // pointer-events none en el contenedor para no robar clicks de la
        // app; los toasts individuales lo restauran a auto.
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const sev = sevCategory(toast.ev);
        const color = sevColor(sev);
        const isAcking = acking.has(toast.ev.id);
        return (
          <Card
            key={toast.ev.id}
            elevation={6}
            sx={{
              pointerEvents: 'auto',
              bgcolor: `${color}.main`,
              color: `${color}.contrastText`,
              backdropFilter: 'blur(8px)',
              animation: 'rtls-toast-slide-in 0.3s ease-out',
              '@keyframes rtls-toast-slide-in': {
                from: { transform: 'translateX(100%)', opacity: 0 },
                to: { transform: 'translateX(0)', opacity: 1 },
              },
            }}
          >
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Avatar
                  src={toast.ev.workerPhotoUrl ?? undefined}
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: 'rgba(255,255,255,0.2)',
                    color: 'inherit',
                    border: 2,
                    borderColor: 'rgba(255,255,255,0.4)',
                  }}
                >
                  {!toast.ev.workerPhotoUrl && sevIcon(sev)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.25 }}>
                    <Chip
                      size="small"
                      label={toast.ev.zoneType ? t(`zones.zoneTypeLabel.${toast.ev.zoneType}`) : sev.toUpperCase()}
                      sx={{
                        height: 18,
                        fontSize: 10,
                        bgcolor: 'rgba(255,255,255,0.25)',
                        color: 'inherit',
                        fontWeight: 600,
                      }}
                    />
                    <Box sx={{ flex: 1 }} />
                    <IconButton
                      size="small"
                      onClick={() => dismiss(toast.ev.id)}
                      sx={{ color: 'inherit', p: 0.25 }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {toast.ev.workerName ?? `${t('alerts.bannerWorkerFallback')} ${toast.ev.tagSerial}`}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                    <PlaceIcon sx={{ fontSize: 12, opacity: 0.85 }} />
                    <Typography variant="caption" sx={{ opacity: 0.95 }}>
                      {toast.ev.zoneName ?? toast.ev.zoneCode}
                    </Typography>
                  </Stack>
                  {toast.ev.workerCompanyName && (
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.85, mt: 0.25 }}>
                      {toast.ev.workerCompanyName}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<MyLocationIcon />}
                      onClick={() => handleLocate(toast.ev)}
                      sx={{
                        bgcolor: 'rgba(255,255,255,0.92)',
                        color: `${color}.dark`,
                        fontSize: 11,
                        textTransform: 'none',
                        '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
                      }}
                    >
                      {t('common.viewIn3D')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleAck(toast.ev.id)}
                      disabled={isAcking}
                      sx={{
                        borderColor: 'rgba(255,255,255,0.7)',
                        color: 'inherit',
                        fontSize: 11,
                        textTransform: 'none',
                        '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
                      }}
                    >
                      {isAcking ? 'ACK…' : 'ACK'}
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

export default AlertBanner;
