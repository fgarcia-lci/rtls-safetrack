import {
  Box,
  Paper,
  Typography,
  FormControlLabel,
  Switch,
  Stack,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { PlantView } from './types';

interface Props {
  plantView: PlantView | null;
  visibility: Record<string, boolean>;
  onToggle: (code: string, visible: boolean) => void;
}

export function LayersPanel({ plantView, visibility, onToggle }: Props) {
  const { t } = useTranslation();
  if (!plantView || plantView.layers.length === 0) return null;

  // Si solo hay 1 layer, no merece la pena mostrar el panel
  if (plantView.layers.length === 1) return null;

  return (
    <Paper sx={{ p: 2, minWidth: 240 }}>
      <Typography variant="overline" color="text.secondary">
        {t('live.layers')}
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {plantView.layers.map((layer) => (
          <FormControlLabel
            key={layer.code}
            control={
              <Switch
                size="small"
                checked={visibility[layer.code] ?? layer.defaultVisible}
                onChange={(e) => onToggle(layer.code, e.target.checked)}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                {layer.displayColor && (
                  <Box
                    sx={{
                      width: 12, height: 12, borderRadius: '50%',
                      bgcolor: layer.displayColor,
                      border: '1px solid rgba(0,0,0,0.2)',
                    }}
                  />
                )}
                <Typography variant="body2">{layer.name}</Typography>
              </Stack>
            }
          />
        ))}
      </Stack>
    </Paper>
  );
}

export default LayersPanel;
