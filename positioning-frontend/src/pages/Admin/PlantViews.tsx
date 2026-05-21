// Admin de PlantViews — listado + alta/edición de FLOORPLAN_2D (SVG).
//
// El flujo esperado para una nueva planta:
//   1. Admin genera el SVG desde Revit con LibreCAD:
//      Revit → "Export → CAD Formats → DXF"   (unidad: metros)
//      LibreCAD: abrir DXF → "File → Export → SVG"
//      En LibreCAD, "Properties → Bounding Box" de la geometría completa
//      le da los 4 números que pedimos abajo.
//   2. Drop del SVG en el formulario; rellenar bbox + activarlo.
//   3. La página /live (vista 2D) lo consumirá automáticamente.
//
// Para MODEL_3D solo permitimos toggle activo/inactivo desde aquí — su
// creación sigue siendo manual (Flyway + .xkt en /models/).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Toolbar,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  CircularProgress,
  Divider,
  Link,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  UploadFile as UploadIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material';
import { plantViewService } from '../../services/plantViewService';
import { zoneService } from '../../services/zoneService';
import { config } from '../../config/config';
import type { FloorplanUpsertPayload, PlantView } from '../Live/types';
import type { SafetyZone } from '../../types/zones';

interface FormState {
  code: string;
  name: string;
  svgContent: string;
  worldBboxMinX: string;
  worldBboxMinY: string;
  worldBboxMaxX: string;
  worldBboxMaxY: string;
  svgFlipY: boolean;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  svgContent: '',
  worldBboxMinX: '',
  worldBboxMinY: '',
  worldBboxMaxX: '',
  worldBboxMaxY: '',
  svgFlipY: true,
  isActive: true,
};

export const PlantViews = () => {
  const plantId = config.plant.defaultId;
  const [views, setViews] = useState<PlantView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlantView | null>(null);
  const [previewOf, setPreviewOf] = useState<PlantView | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await plantViewService.listAllForPlant(plantId);
      setViews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando plant-views');
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  useEffect(() => { void reload(); }, [reload]);

  const handleNewFloorplan = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (v: PlantView) => {
    setEditing(v);
    setDialogOpen(true);
  };
  const handleDelete = async (v: PlantView) => {
    const verb = v.type === 'FLOORPLAN_2D' ? 'borrar' : 'desactivar';
    if (!confirm(`¿Seguro que quieres ${verb} la vista "${v.name}"?`)) return;
    try {
      await plantViewService.deletePlantView(v.id);
      setToast({ msg: 'Vista eliminada', sev: 'success' });
      void reload();
    } catch (e) {
      setToast({
        msg: e instanceof Error ? e.message : 'Error al borrar',
        sev: 'error',
      });
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4">Vistas de planta</Typography>
          <Typography variant="caption" color="text.secondary">
            Modelos 3D (XKT) y planos 2D (SVG) registrados para esta planta.
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Button startIcon={<AddIcon />} variant="contained" onClick={handleNewFloorplan}>
          Nuevo plano 2D
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : views.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            No hay vistas registradas para la planta {plantId}.
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Código</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Bbox mundo (m)</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {views.map((v) => (
                <TableRow key={v.id} hover>
                  <TableCell><code>{v.code}</code></TableCell>
                  <TableCell>{v.name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={v.type === 'FLOORPLAN_2D' ? '2D · SVG' : '3D · XKT'}
                      color={v.type === 'FLOORPLAN_2D' ? 'info' : 'primary'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {v.type === 'FLOORPLAN_2D' && v.worldBboxMinX != null
                      ? `[${v.worldBboxMinX}, ${v.worldBboxMinY}] → [${v.worldBboxMaxX}, ${v.worldBboxMaxY}]`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={v.isActive ? 'Activa' : 'Inactiva'}
                      color={v.isActive ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    {v.type === 'FLOORPLAN_2D' && (
                      <Tooltip title="Previsualizar con zonas">
                        <IconButton size="small" onClick={() => setPreviewOf(v)}>
                          <PreviewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {v.type === 'FLOORPLAN_2D' && (
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => handleEdit(v)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={v.type === 'FLOORPLAN_2D' ? 'Borrar' : 'Desactivar'}>
                      <IconButton size="small" color="error" onClick={() => handleDelete(v)}>
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

      <FloorplanDialog
        open={dialogOpen}
        plantId={plantId}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setToast({
            msg: editing ? 'Plano actualizado' : 'Plano creado',
            sev: 'success',
          });
          void reload();
        }}
      />

      <FloorplanPreviewDialog
        view={previewOf}
        onClose={() => setPreviewOf(null)}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? <Alert severity={toast.sev}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

// -----------------------------------------------------------------------------
// Dialog: nuevo / editar plano 2D
// -----------------------------------------------------------------------------

interface FloorplanDialogProps {
  open: boolean;
  plantId: string;
  initial: PlantView | null;
  onClose: () => void;
  onSaved: () => void;
}

function FloorplanDialog({ open, plantId, initial, onClose, onSaved }: FloorplanDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setForm({
        code: initial.code,
        name: initial.name,
        svgContent: '',  // se carga bajo demanda si el admin quiere reemplazarlo
        worldBboxMinX: String(initial.worldBboxMinX ?? ''),
        worldBboxMinY: String(initial.worldBboxMinY ?? ''),
        worldBboxMaxX: String(initial.worldBboxMaxX ?? ''),
        worldBboxMaxY: String(initial.worldBboxMaxY ?? ''),
        svgFlipY: initial.svgFlipY ?? true,
        isActive: initial.isActive ?? true,
      });
      setFileName('(SVG existente — solo se sustituye si subes uno nuevo)');
    } else {
      setForm(EMPTY_FORM);
      setFileName('');
    }
  }, [open, initial]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  /**
   * Lee el SVG seleccionado y, si es posible, autorellena el bbox desde su
   * atributo `viewBox`. El admin puede sobrescribirlo si los números no
   * coinciden con los metros reales del mundo.
   */
  const onFileSelected = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    update('svgContent', text);
    // Intento de extracción del viewBox para autorrellenar bbox.
    const match = text.match(/viewBox\s*=\s*"([^"]+)"/);
    if (match) {
      const parts = match[1].trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [minX, minY, w, h] = parts;
        setForm((p) => ({
          ...p,
          worldBboxMinX: String(minX),
          worldBboxMinY: String(minY),
          worldBboxMaxX: String(minX + w),
          worldBboxMaxY: String(minY + h),
        }));
      }
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const minX = Number(form.worldBboxMinX);
    const minY = Number(form.worldBboxMinY);
    const maxX = Number(form.worldBboxMaxX);
    const maxY = Number(form.worldBboxMaxY);
    if (!form.code.trim() || !form.name.trim()) {
      setError('Código y nombre son obligatorios.');
      return;
    }
    if (!initial && !form.svgContent.trim()) {
      setError('Adjunta un fichero SVG.');
      return;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) ||
        !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      setError('Los 4 valores del bbox deben ser números.');
      return;
    }
    if (maxX <= minX || maxY <= minY) {
      setError('maxX/maxY deben ser mayores que minX/minY.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: FloorplanUpsertPayload = {
        plantId,
        code: form.code.trim(),
        name: form.name.trim(),
        svgContent: form.svgContent,
        worldBboxMinX: minX,
        worldBboxMinY: minY,
        worldBboxMaxX: maxX,
        worldBboxMaxY: maxY,
        svgFlipY: form.svgFlipY,
        isActive: form.isActive,
      };
      if (initial) {
        // Si no se ha subido un SVG nuevo, conservamos el existente: el backend
        // exige svgContent NotBlank, así que hay que pedirlo al endpoint asset.
        if (!form.svgContent.trim()) {
          const res = await fetch(plantViewService.assetUrl(initial.id), {
            credentials: 'include',
          });
          if (!res.ok) throw new Error('No se pudo recuperar el SVG existente');
          payload.svgContent = await res.text();
        }
        await plantViewService.updateFloorplan(initial.id, payload);
      } else {
        await plantViewService.createFloorplan(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? (e instanceof Error ? e.message : 'Error al guardar'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{initial ? `Editar plano: ${initial.name}` : 'Nuevo plano 2D'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Alert severity="info" icon={false}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Cómo generar el SVG</Typography>
            <Typography variant="caption" component="div" sx={{ mt: 0.5, lineHeight: 1.5 }}>
              1. Revit → <code>File → Export → CAD Formats → DXF</code> (unidad: metros).<br />
              2. LibreCAD: abre el DXF → <code>File → Export → SVG</code>.<br />
              3. En LibreCAD, selecciona toda la geometría → <code>Properties</code> para leer
              el bounding box en metros. Esos 4 números van abajo.
            </Typography>
          </Alert>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Código" value={form.code}
              onChange={(e) => update('code', e.target.value)}
              required size="small" sx={{ flex: 1 }}
              helperText="Único por planta. Ej: PLANTA_BAJA, NIVEL_+5"
            />
            <TextField
              label="Nombre" value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required size="small" sx={{ flex: 2 }}
            />
          </Stack>

          <Divider />
          <Typography variant="overline" color="text.secondary">Fichero SVG</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="outlined" component="label" startIcon={<UploadIcon />}
              disabled={submitting}
            >
              Seleccionar SVG
              <input
                type="file" accept=".svg,image/svg+xml" hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFileSelected(f);
                }}
              />
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, wordBreak: 'break-all' }}>
              {fileName || 'Ningún fichero seleccionado.'}
            </Typography>
          </Stack>

          <Divider />
          <Typography variant="overline" color="text.secondary">Bbox en coords mundo (metros)</Typography>
          <Typography variant="caption" color="text.secondary">
            Si el SVG trae <code>viewBox</code>, intentamos autorrellenar. Verifica que coincide
            con las coordenadas mundo reales (mismo origen que el XKT 3D).
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="minX" type="number" value={form.worldBboxMinX}
              onChange={(e) => update('worldBboxMinX', e.target.value)}
              required size="small" sx={{ flex: 1 }}
            />
            <TextField
              label="minY" type="number" value={form.worldBboxMinY}
              onChange={(e) => update('worldBboxMinY', e.target.value)}
              required size="small" sx={{ flex: 1 }}
            />
            <TextField
              label="maxX" type="number" value={form.worldBboxMaxX}
              onChange={(e) => update('worldBboxMaxX', e.target.value)}
              required size="small" sx={{ flex: 1 }}
            />
            <TextField
              label="maxY" type="number" value={form.worldBboxMaxY}
              onChange={(e) => update('worldBboxMaxY', e.target.value)}
              required size="small" sx={{ flex: 1 }}
            />
          </Stack>

          <Stack direction="row" spacing={3}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.svgFlipY}
                  onChange={(e) => update('svgFlipY', e.target.checked)}
                />
              }
              label="Invertir eje Y (export Y-up de CAD)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={(e) => update('isActive', e.target.checked)}
                />
              }
              label="Activo en /live"
            />
          </Stack>

          {/* Mini-preview en vivo del SVG cargado */}
          {form.svgContent && (
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 300, overflow: 'auto', bgcolor: 'background.default' }}>
              <Typography variant="caption" color="text.secondary">Preview del SVG cargado:</Typography>
              <Box
                sx={{ mt: 1, '& svg': { maxWidth: '100%', maxHeight: 240, display: 'block' } }}
                dangerouslySetInnerHTML={{ __html: form.svgContent }}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Dialog: preview con zonas superpuestas
// -----------------------------------------------------------------------------

interface PreviewProps {
  view: PlantView | null;
  onClose: () => void;
}

function FloorplanPreviewDialog({ view, onClose }: PreviewProps) {
  const [svg, setSvg] = useState<string>('');
  const [zones, setZones] = useState<SafetyZone[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!view) { setSvg(''); setZones([]); return; }
    setLoading(true);
    Promise.all([
      fetch(plantViewService.assetUrl(view.id), { credentials: 'include' })
        .then((r) => r.text()),
      zoneService.listByPlant(view.plantId, true),
    ])
      .then(([s, zs]) => { setSvg(s); setZones(zs); })
      .finally(() => setLoading(false));
  }, [view]);

  const bbox = useMemo(() => {
    if (!view || view.worldBboxMinX == null) return null;
    return {
      minX: view.worldBboxMinX!,
      minY: view.worldBboxMinY!,
      maxX: view.worldBboxMaxX!,
      maxY: view.worldBboxMaxY!,
    };
  }, [view]);

  return (
    <Dialog open={!!view} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Preview: {view?.name}
        {bbox && (
          <Typography variant="caption" sx={{ ml: 1 }} color="text.secondary">
            {(bbox.maxX - bbox.minX).toFixed(1)} × {(bbox.maxY - bbox.minY).toFixed(1)} m
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : !bbox ? (
          <Alert severity="warning">Sin bbox — no se puede previsualizar.</Alert>
        ) : (
          <Box sx={{ height: 500, bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
            <PreviewSvg svg={svg} bbox={bbox} flipY={view?.svgFlipY ?? true} zones={zones} />
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Las zonas activas se pintan en sus colores reales sobre el plano. Si una zona aparece fuera del plano,
          revisa que el bbox y las coordenadas mundo coinciden.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Link
          href={view ? plantViewService.assetUrl(view.id) : '#'}
          target="_blank" rel="noopener"
          sx={{ mr: 'auto', ml: 2 }}
        >
          Ver SVG en pestaña aparte
        </Link>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

interface PreviewSvgProps {
  svg: string;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  flipY: boolean;
  zones: SafetyZone[];
}

function PreviewSvg({ svg, bbox, flipY, zones }: PreviewSvgProps) {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  // Extraemos lo de dentro de <svg>...</svg> para inyectarlo dentro de un <g>
  // controlado por nosotros (con transform a coords mundo).
  const innerSvg = useMemo(() => extractSvgInner(svg), [svg]);
  // Cuando flipY=true, mapeamos Y_svg = (maxY+minY) - Y_world para que el
  // mundo crezca hacia arriba como en CAD.
  const transform = flipY
    ? `translate(0 ${bbox.maxY + bbox.minY}) scale(1 -1)`
    : 'translate(0 0)';
  return (
    <svg
      width="100%" height="100%"
      viewBox={`${bbox.minX} ${bbox.minY} ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <g transform={transform} dangerouslySetInnerHTML={{ __html: innerSvg }} />
      {/* Zonas encima (coords mundo, sin flip — están ya en world-Y-up).
          Si flipY=true, las pintamos también dentro de la transformación
          inversa para que coincidan con el plano. */}
      <g transform={flipY ? `translate(0 ${bbox.maxY + bbox.minY}) scale(1 -1)` : undefined}>
        {zones.map((z) => (
          <polygon
            key={z.id}
            points={z.polygon2d.map(([x, y]) => `${x},${y}`).join(' ')}
            fill={(z.displayColor ?? '#888') + '55'}
            stroke={z.displayColor ?? '#888'}
            strokeWidth={0.3}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * Devuelve el contenido interno de un SVG. Si no hay envoltura `<svg>`, devuelve
 * el texto tal cual. Permite injectarlo dentro de nuestro `<g transform>` para
 * controlar la escala/flip Y desde React sin chocar con el viewBox interno.
 */
function extractSvgInner(svgText: string): string {
  const open = svgText.indexOf('<svg');
  const close = svgText.indexOf('>', open);
  const end = svgText.lastIndexOf('</svg>');
  if (open === -1 || close === -1 || end === -1) return svgText;
  return svgText.substring(close + 1, end);
}

export default PlantViews;
