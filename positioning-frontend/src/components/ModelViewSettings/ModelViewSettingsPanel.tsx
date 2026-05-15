// Panel de ajustes del modelo 3D — botón con icono en el header de Live
// que despliega un Popover con los controles (offset Y, altura
// muñequitos, vista inicial, reset). Persistente en localStorage por
// plantViewId.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  IconButton,
  Typography,
  TextField,
  Button,
  Stack,
  Tooltip,
  Popover,
} from '@mui/material';
import {
  Tune as TuneIcon,
  CameraAlt as CameraAltIcon,
  Restore as RestoreIcon,
} from '@mui/icons-material';
import type { ModelViewConfig } from '../../utils/modelViewConfig';

interface Props {
  /** Config actual (origen único de la verdad — vive en el padre). */
  config: ModelViewConfig;
  /** Cambio numérico del offset Y. */
  onYOffsetChange: (value: number) => void;
  /** Cambio de la altura del avatar (en metros). */
  onAvatarHeightChange: (value: number) => void;
  /** Captura el eye/look actual del viewer (lo lee el padre). */
  onCaptureView: () => void;
  /** Reset a defaults (yOffset=0, eye/look=null → flyTo default). */
  onReset: () => void;
}

export function ModelViewSettingsPanel({
  config,
  onYOffsetChange,
  onAvatarHeightChange,
  onCaptureView,
  onReset,
}: Props) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title={t('modelSettings.tooltip')}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <TuneIcon />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, width: 280 } } }}
      >
        <Stack spacing={1.5}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {t('modelSettings.title')}
          </Typography>

          {/* Offset Y */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('modelSettings.yOffsetLabel')}
            </Typography>
            <TextField
              type="number"
              size="small"
              value={config.yOffset}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) onYOffsetChange(v);
                else onYOffsetChange(0);
              }}
              fullWidth
              inputProps={{ step: 0.5 }}
              helperText={t('modelSettings.yOffsetHelp')}
              FormHelperTextProps={{ sx: { mt: 0.25, fontSize: 10 } }}
            />
          </Box>

          {/* Altura de los avatares en metros */}
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('modelSettings.avatarHeightLabel')}
            </Typography>
            <TextField
              type="number"
              size="small"
              value={config.avatarHeightM}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onAvatarHeightChange(v);
              }}
              fullWidth
              inputProps={{ step: 0.1, min: 0.5, max: 5 }}
              helperText={t('modelSettings.avatarHeightHelp')}
              FormHelperTextProps={{ sx: { mt: 0.25, fontSize: 10 } }}
            />
          </Box>

          {/* Vista inicial */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {t('modelSettings.initialViewLabel')}
            </Typography>
            <Tooltip title={t('modelSettings.captureViewTooltip')}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CameraAltIcon />}
                onClick={onCaptureView}
                fullWidth
              >
                {t('modelSettings.captureView')}
              </Button>
            </Tooltip>
            {config.cameraEye && config.cameraLook && (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, fontSize: 10 }}>
                {t('modelSettings.viewSaved', { eye: config.cameraEye.map(n => n.toFixed(0)).join(',') })}
              </Typography>
            )}
          </Box>

          {/* Reset */}
          <Button
            size="small"
            color="warning"
            startIcon={<RestoreIcon />}
            onClick={onReset}
            fullWidth
          >
            {t('modelSettings.reset')}
          </Button>
        </Stack>
      </Popover>
    </>
  );
}

export default ModelViewSettingsPanel;
