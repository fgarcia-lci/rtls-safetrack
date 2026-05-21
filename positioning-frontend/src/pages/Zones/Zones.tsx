// Página /zones — listado y editor de zonas de seguridad.
// Iteración 1: editor por formulario (crea/edita zonas como BOX/CYLINDER/
// POLYGON, persiste como polygon_2d canónico). Iteración 2 (futura) le
// añadirá gizmos 3D TransformControl para mover/escalar visualmente.
import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Stack,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  DeleteOutline as DeleteIcon,
  Warning as WarningIcon,
  ToggleOn as ActivateIcon,
  ToggleOff as DeactivateIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { zoneService } from '../../services/zoneService';
import { config } from '../../config/config';
import type { SafetyZone, ZoneType } from '../../types/zones';

const ZONE_TYPE_COLOR: Record<ZoneType, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  DANGER: 'error',
  RESTRICTED: 'warning',
  WARNING: 'warning',
  SAFE: 'success',
  INFO: 'info',
};

export const Zones = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const plantId = config.plant.defaultId;

  const [zones, setZones] = useState<SafetyZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Zona en proceso de borrado — null cuando el modal está cerrado.
  const [zoneToDelete, setZoneToDelete] = useState<SafetyZone | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadZones = async () => {
    setLoading(true);
    setError(null);
    try {
      // Trae activas + desactivadas (no las borradas — esas las filtra el
      // backend siempre). El usuario puede ver y togglear el estado.
      const data = await zoneService.listByPlant(plantId, false);
      setZones(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar zonas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadZones(); /* eslint-disable-next-line */ }, [plantId]);

  const handleNew = () => navigate('/zones/editor');
  const handleEdit = (zone: SafetyZone) => navigate(`/zones/editor/${zone.id}`);
  const handleToggleActive = async (zone: SafetyZone) => {
    try {
      await zoneService.setActive(zone.id, !zone.isActive);
      void loadZones();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar estado');
    }
  };
  const handleDeleteClick = (zone: SafetyZone) => setZoneToDelete(zone);
  const handleDeleteCancel = () => setZoneToDelete(null);
  const handleDeleteConfirm = async () => {
    if (!zoneToDelete) return;
    setDeleting(true);
    try {
      // Borrado lógico — endpoint DELETE setea deleted_at=now. La zona
      // desaparece del listado y del motor de proximidad. Recuperable
      // desde BD por admin.
      await zoneService.delete(zoneToDelete.id);
      setZoneToDelete(null);
      void loadZones();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">{t('navigation.zones')}</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew}>
          Nueva zona
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        ) : zones.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No hay zonas definidas. Crea la primera con "Nueva zona".</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Forma</TableCell>
                <TableCell align="right">Severity</TableCell>
                <TableCell align="right">Buffer</TableCell>
                <TableCell align="right">zMin / zMax</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {zones.map((z) => (
                <TableRow
                  key={z.id}
                  hover
                  onClick={() => handleEdit(z)}
                  sx={{ opacity: z.isActive ? 1 : 0.55, cursor: 'pointer' }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '2px',
                        bgcolor: z.displayColor ?? '#999',
                        border: '1px solid rgba(0,0,0,0.2)',
                      }} />
                      <code>{z.code}</code>
                    </Box>
                  </TableCell>
                  <TableCell>{z.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={z.type} color={ZONE_TYPE_COLOR[z.type]} />
                  </TableCell>
                  <TableCell>{z.shapeType}</TableCell>
                  <TableCell align="right">{z.severity}</TableCell>
                  <TableCell align="right">{z.bufferApproachM ?? '-'} m</TableCell>
                  <TableCell align="right">{Number(z.zMin).toFixed(1)} / {Number(z.zMax).toFixed(1)}</TableCell>
                  <TableCell>
                    {z.isActive
                      ? <Chip size="small" label="Activa" color="success" variant="outlined" />
                      : <Chip size="small" label="Desactivada" variant="outlined" />}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Ver / editar ficha">
                      <IconButton size="small" color="primary" onClick={() => handleEdit(z)}>
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton size="small" onClick={() => handleEdit(z)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={z.isActive ? 'Desactivar' : 'Activar'}>
                      <IconButton
                        size="small"
                        onClick={() => handleToggleActive(z)}
                        sx={{ color: z.isActive ? 'success.main' : 'text.disabled' }}
                      >
                        {z.isActive
                          ? <ActivateIcon fontSize="small" />
                          : <DeactivateIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Borrar">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(z)}
                        sx={{ color: 'error.main' }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog
        open={zoneToDelete != null}
        onClose={deleting ? undefined : handleDeleteCancel}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          Borrar zona
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Seguro que quieres borrar la zona{' '}
            <strong>{zoneToDelete?.name}</strong> (<code>{zoneToDelete?.code}</code>)?
          </DialogContentText>
          <DialogContentText sx={{ mt: 1.5, fontSize: 13 }}>
            La zona desaparecerá del listado y dejará de evaluarse en el motor
            de proximidad. Es un borrado lógico — los datos siguen en la BD por
            si un administrador necesita recuperarla más adelante.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={<DeleteIcon />}
          >
            {deleting ? 'Borrando…' : 'Borrar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Zones;
