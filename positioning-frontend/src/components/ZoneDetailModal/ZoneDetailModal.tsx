// ZoneDetailModal — modal con la ficha completa de una zona.
//
// Se abre al hacer click sobre una zona en cualquier visor (2D o 3D).
// Muestra: tipo, severidad, dimensiones, alturas, política de notificación,
// roles permitidos. Permite navegar al editor para modificar.
//
// Diseño: simple Dialog MUI. Sin tabs ni complejidad — el catálogo
// completo de "qué hace cada zona" vive en docs/11. Aquí solo damos al
// usuario los datos clave de ESTA zona concreta.

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Stack,
  Divider,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Place as PlaceIcon,
  Layers as LayersIcon,
  Notifications as NotificationsIcon,
  Group as GroupIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SafetyZone, ZoneType } from '../../types/zones';

interface Props {
  zone: SafetyZone | null;
  onClose: () => void;
}

const ZONE_TYPE_COLOR: Record<ZoneType, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  DANGER: 'error',
  RESTRICTED: 'warning',
  WARNING: 'warning',
  SAFE: 'success',
  INFO: 'info',
};


function severityChipColor(s: number): 'error' | 'warning' | 'info' | 'default' {
  if (s >= 4) return 'error';
  if (s === 3) return 'warning';
  if (s >= 1) return 'info';
  return 'default';
}

function bboxOfPolygon(poly: [number, number][]): { dx: number; dy: number } {
  if (poly.length === 0) return { dx: 0, dy: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { dx: maxX - minX, dy: maxY - minY };
}

export function ZoneDetailModal({ zone, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!zone) return null;

  const dims = bboxOfPolygon(zone.polygon2d);
  const altura = (zone.zMax - zone.zMin).toFixed(1);

  const handleEdit = () => {
    navigate(`/zones/editor/${zone.id}`);
    onClose();
  };

  return (
    <Dialog open={!!zone} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {zone.displayColor && (
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: zone.displayColor,
                border: 1,
                borderColor: 'divider',
              }}
            />
          )}
          <Typography variant="h6" component="span">
            {zone.name}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }}>
          {zone.code}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Chips fila */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              label={t(`zones.zoneTypeLabel.${zone.type}`)}
              color={ZONE_TYPE_COLOR[zone.type]}
              size="small"
            />
            <Chip
              label={`${t('zones.detail.severity')} ${zone.severity}`}
              color={severityChipColor(zone.severity)}
              size="small"
              variant="outlined"
            />
            <Chip
              label={t(`zones.shapeType.${zone.shapeType}`)}
              size="small"
              variant="outlined"
            />
            {!zone.isActive && (
              <Chip label={t('zones.detail.inactive')} size="small" color="default" />
            )}
          </Stack>

          {zone.description && (
            <Typography variant="body2" color="text.secondary">
              {zone.description}
            </Typography>
          )}

          <Divider />

          {/* Dimensiones */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <PlaceIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">{t('zones.detail.dimensions')}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {t('zones.detail.bboxHorizontal')}: {dims.dx.toFixed(1)} × {dims.dy.toFixed(1)} m
              {' · '}
              {t('zones.detail.height')}: {altura} m ({zone.zMin.toFixed(1)} → {zone.zMax.toFixed(1)})
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {t('zones.detail.polygon')}: {t('zones.detail.vertices', { count: zone.polygon2d.length })}
            </Typography>
            {zone.bufferApproachM != null && zone.bufferApproachM > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('zones.detail.approachBuffer')}: <b>{zone.bufferApproachM} m</b>
              </Typography>
            )}
          </Box>

          {/* Equipo relacionado (solo si está) */}
          {zone.relatedDeviceId && (
            <>
              <Divider />
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
                  <LayersIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2">{t('zones.detail.linkedEquipment')}</Typography>
                </Stack>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {zone.relatedDeviceId}
                </Typography>
              </Box>
            </>
          )}

          {/* Roles permitidos */}
          {zone.allowedRoles && zone.allowedRoles.length > 0 && (
            <>
              <Divider />
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                  <GroupIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2">{t('zones.detail.rolesAllowed')}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {zone.allowedRoles.map((r) => (
                    <Chip key={r} label={r} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Política de notificación */}
          <Divider />
          <Box>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
              <NotificationsIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">{t('zones.detail.notificationPolicy')}</Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {zone.notificationPolicy?.notifyWorker && (
                <Chip label={t('zones.detail.notifyWorker')} size="small" color="primary" variant="outlined" />
              )}
              {zone.notificationPolicy?.notifySupervisor && (
                <Chip label={t('zones.detail.notifySupervisor')} size="small" color="primary" variant="outlined" />
              )}
              {zone.notificationPolicy?.notifySafetyTeam && (
                <Chip label={t('zones.detail.notifySafety')} size="small" color="error" variant="outlined" />
              )}
              {zone.notificationPolicy?.notifyAllManagers && (
                <Chip label={t('zones.detail.notifyManagers')} size="small" color="warning" variant="outlined" />
              )}
              {zone.notificationPolicy?.channelInApp && (
                <Chip label={t('zones.detail.channelInApp')} size="small" />
              )}
              {zone.notificationPolicy?.channelEmail && (
                <Chip label={t('zones.detail.channelEmail')} size="small" />
              )}
              {zone.notificationPolicy?.channelHapticMqtt && (
                <Chip label={t('zones.detail.channelHaptic')} size="small" />
              )}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
        <Button
          onClick={handleEdit}
          startIcon={<EditIcon />}
          variant="contained"
        >
          {t('zones.detail.editZone')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ZoneDetailModal;
