// Modal que se abre al pulsar "Replay" en el toggle de Live.
//
// Pregunta:
//   - Punto de inicio (date + hora) dentro de la ventana de retención
//   - Duración a cargar (1h, 4h, 12h, 24h máx — backend cap)
//
// Al confirmar, llama a playbackService.getPlayback y entrega el PlaybackDto
// al padre vía onLoaded(). El padre se encarga de activar el modo replay.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  CircularProgress,
} from '@mui/material';
import { History as HistoryIcon } from '@mui/icons-material';
import { playbackService } from '../../services/playbackService';
import type { PlaybackDto } from '../../types/playback';

interface Props {
  open: boolean;
  plantId: string;
  onClose: () => void;
  onLoaded: (playback: PlaybackDto) => void;
}

const DURATIONS_HOURS = [1, 4, 12, 24];

/** ISO formato local sin segundos para datetime-local input. */
function isoForInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReplaySetupDialog({ open, plantId, onClose, onLoaded }: Props) {
  // Default: ahora menos 1h. El usuario lo ajusta.
  const [startInput, setStartInput] = useState<string>(() => {
    const d = new Date(Date.now() - 60 * 60 * 1000);
    return isoForInput(d);
  });
  const [durationHours, setDurationHours] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resetea defaults cada vez que se abre — evita arrastrar valores raros
  // entre aperturas consecutivas.
  useEffect(() => {
    if (!open) return;
    const d = new Date(Date.now() - 60 * 60 * 1000);
    setStartInput(isoForInput(d));
    setDurationHours(1);
    setError(null);
  }, [open]);

  const handleLoad = async () => {
    setError(null);
    const fromDate = new Date(startInput);
    if (Number.isNaN(fromDate.getTime())) {
      setError('Fecha inicio no válida');
      return;
    }
    const toDate = new Date(fromDate.getTime() + durationHours * 3600 * 1000);
    if (toDate.getTime() > Date.now() + 60 * 1000) {
      // No tiene sentido pedir replay del futuro — capamos al instante actual.
      toDate.setTime(Date.now());
    }
    setLoading(true);
    try {
      const data = await playbackService.getPlayback(
        plantId,
        fromDate.toISOString(),
        toDate.toISOString(),
      );
      onLoaded(data);
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string }; status?: number } };
      setError(err.response?.data?.message ?? (e instanceof Error ? e.message : 'Error cargando replay'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <HistoryIcon />
        Replay temporal
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Typography variant="caption" color="text.secondary">
            Cargamos un tramo del histórico de la planta y lo reproduces como un
            vídeo: ves los movimientos, las entradas en zonas peligrosas y los SOS
            tal como pasaron.
          </Typography>

          <TextField
            label="Comienza en"
            type="datetime-local"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            disabled={loading}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Duración a reproducir
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={durationHours}
              onChange={(_, v) => v && setDurationHours(v)}
              fullWidth
            >
              {DURATIONS_HOURS.map((h) => (
                <ToggleButton key={h} value={h} disabled={loading}>
                  {h === 24 ? '24h' : `${h}h`}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary">
              Máx 24h por carga (limitación del backend para evitar payloads enormes).
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancelar</Button>
        <Button onClick={handleLoad} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Cargar replay'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ReplaySetupDialog;
