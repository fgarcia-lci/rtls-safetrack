// Diálogo de edición/creación de zonas. Iteración 1: editor por
// formulario (sin gizmos 3D todavía — esos se añadirán encima en una
// segunda iteración manteniendo la misma API REST).
//
// Soporta 3 tipos de primitiva:
//   - BOX: AABB con centerX/centerZ/sizeX/sizeZ + zMin/zMax.
//   - CYLINDER: centerX/centerZ/radius + zMin/zMax.
//   - POLYGON: vértices [x,y] introducidos como JSON (avanzado).
// Convierte a la representación canónica polygon_2d antes de POST/PUT.
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  Alert,
  Switch,
  FormControlLabel,
  Box,
} from '@mui/material';
import {
  CheckBoxOutlineBlank as BoxIcon,
  Circle as CircleIcon,
  Polyline as PolylineIcon,
} from '@mui/icons-material';
import {
  zoneService,
  type SafetyZoneCreatePayload,
  type SafetyZoneUpdatePayload,
} from '../../services/zoneService';
import {
  boxToPolygon,
  cylinderToPolygon,
  polygonToBox,
  polygonToCylinder,
} from './zoneShape';
import { ZonePreview2D } from './ZonePreview2D';
import type {
  SafetyZone,
  ShapeType,
  ZoneType,
} from '../../types/zones';

interface ModelAabb {
  minX: number; maxX: number;
  minY: number; maxY: number;  // alturas (Y xeokit Y-up)
  minZ: number; maxZ: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** null = crear nueva; SafetyZone = editar existente. */
  zone: SafetyZone | null;
  plantId: string;
  /** Otras zonas que se renderizan como contexto en el preview top-down. */
  otherZones?: SafetyZone[];
  /** AABB del modelo 3D — para centrar zonas nuevas y dibujar footprint. */
  modelAabb: ModelAabb | null;
}

const ZONE_TYPES: ZoneType[] = ['DANGER', 'RESTRICTED', 'WARNING', 'SAFE', 'INFO'];

const DEFAULT_COLOR_BY_TYPE: Record<ZoneType, string> = {
  DANGER: '#e63939',
  RESTRICTED: '#f5b91d',
  WARNING: '#f5b91d',
  SAFE: '#34c759',
  INFO: '#5b9bd5',
};

export function ZoneEditDialog({ open, onClose, onSaved, zone, plantId, otherZones = [], modelAabb }: Props) {
  const isNew = zone == null;

  // Metadata
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ZoneType>('DANGER');
  const [shapeType, setShapeType] = useState<ShapeType>('BOX');
  const [severity, setSeverity] = useState(4);
  const [displayColor, setDisplayColor] = useState('#e63939');
  const [bufferApproachM, setBufferApproachM] = useState(3);
  const [isActive, setIsActive] = useState(true);

  // Geometría
  const [centerX, setCenterX] = useState(0);
  const [centerZ, setCenterZ] = useState(0);
  const [sizeX, setSizeX] = useState(20);
  const [sizeZ, setSizeZ] = useState(20);
  const [radius, setRadius] = useState(10);
  const [zMin, setZMin] = useState(64);
  const [zMax, setZMax] = useState(80);
  const [polygonText, setPolygonText] = useState('[[0,0],[10,0],[10,10],[0,10]]');

  // Estado UI
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Auto-generación + validación de unicidad del código (solo en isNew).
  const [autoCode, setAutoCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  // modelAabb llega como prop desde el padre — se carga ANTES de abrir el
  // diálogo, así garantizamos que las zonas nuevas se posicionen en el
  // medio del modelo y no en (0,0) que cae a 30M m de distancia.

  // Inicializar campos cuando se abre el dialog.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (zone) {
      setCode(zone.code);
      setName(zone.name);
      setDescription(zone.description ?? '');
      setType(zone.type);
      setShapeType(zone.shapeType);
      setSeverity(zone.severity);
      setDisplayColor(zone.displayColor ?? DEFAULT_COLOR_BY_TYPE[zone.type]);
      setBufferApproachM(zone.bufferApproachM ?? 3);
      setIsActive(zone.isActive);
      setZMin(Number(zone.zMin));
      setZMax(Number(zone.zMax));
      // Reconstruir parámetros de la primitiva.
      if (zone.shapeType === 'BOX') {
        const b = polygonToBox(zone.polygon2d);
        setCenterX(b.centerX); setCenterZ(b.centerZ);
        setSizeX(b.sizeX); setSizeZ(b.sizeZ);
      } else if (zone.shapeType === 'CYLINDER') {
        const c = polygonToCylinder(zone.polygon2d);
        setCenterX(c.centerX); setCenterZ(c.centerZ);
        setRadius(c.radius);
      } else {
        setPolygonText(JSON.stringify(zone.polygon2d));
      }
    } else {
      // Defaults para nueva zona — centrada en el medio del modelo si
      // tenemos AABB (mucho más útil que (0,0) que cae fuera del mapa).
      setCode('');
      setAutoCode('');
      setCodeError(null);
      // Pedimos el próximo código libre para esta planta y lo pre-rellenamos.
      zoneService.getNextCode(plantId)
        .then((c) => {
          setAutoCode(c);
          setCode((prev) => (prev === '' ? c : prev));
        })
        .catch(() => { /* el admin podrá teclearlo a mano */ });
      setName('');
      setDescription('');
      setType('DANGER');
      setShapeType('BOX');
      setSeverity(4);
      setDisplayColor('#e63939');
      setBufferApproachM(3);
      setIsActive(true);
      const cx = modelAabb ? (modelAabb.minX + modelAabb.maxX) / 2 : 0;
      const cz = modelAabb ? (modelAabb.minZ + modelAabb.maxZ) / 2 : 0;
      setCenterX(cx); setCenterZ(cz);
      setSizeX(20); setSizeZ(20);
      setRadius(10);
      // Default zMin = suelo del modelo MENOS un margen (FLOOR_MARGIN_M).
      // El margen tolera mismatches entre el aabb del XKT, el bbox
      // calibrado del plantView y el `default_z` del simulador: sin él,
      // un operario a la altura del suelo puede caer 1-2 cm por debajo de
      // zMin y el motor lo deja fuera vertical (incidente 2026-05-15).
      // zMax = +20 m abarca la altura típica de un piso.
      const FLOOR_MARGIN_M = 0.5;
      const floorY = modelAabb ? modelAabb.minY : 0;
      setZMin(floorY - FLOOR_MARGIN_M); setZMax(floorY + 20);
      setPolygonText(`[[${cx - 10},${cz - 10}],[${cx + 10},${cz - 10}],[${cx + 10},${cz + 10}],[${cx - 10},${cz + 10}]]`);
    }
  }, [open, zone, modelAabb]);

  // Auto-actualizar color cuando cambia type (solo en creación, para no
  // pisar al usuario si lo había personalizado).
  useEffect(() => {
    if (isNew) setDisplayColor(DEFAULT_COLOR_BY_TYPE[type]);
  }, [type, isNew]);

  const polygon2d = useMemo<[number, number][]>(() => {
    if (shapeType === 'BOX') return boxToPolygon({ centerX, centerZ, sizeX, sizeZ });
    if (shapeType === 'CYLINDER') return cylinderToPolygon({ centerX, centerZ, radius });
    try {
      return JSON.parse(polygonText) as [number, number][];
    } catch {
      return [];
    }
  }, [shapeType, centerX, centerZ, sizeX, sizeZ, radius, polygonText]);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (isNew && !code.trim()) { setError('El código es obligatorio para zonas nuevas.'); return; }
    if (codeError) { setError(codeError); return; }
    if (checkingCode) { setError('Espera, estoy comprobando la disponibilidad del código...'); return; }
    if (polygon2d.length < 3) { setError('El polígono debe tener al menos 3 vértices.'); return; }
    if (zMin >= zMax) { setError('zMin debe ser menor que zMax.'); return; }

    setSaving(true);
    try {
      if (isNew) {
        const payload: SafetyZoneCreatePayload = {
          plantId,
          code: code.trim(),
          name: name.trim(),
          description: description || null,
          type,
          shapeType,
          severity,
          polygon2d,
          zMin,
          zMax,
          bufferApproachM,
          displayColor,
          allowedRoles: [],
        };
        await zoneService.create(payload);
      } else {
        const payload: SafetyZoneUpdatePayload = {
          name: name.trim(),
          description: description || null,
          type,
          shapeType,
          severity,
          polygon2d,
          zMin,
          zMax,
          bufferApproachM,
          isActive,
          displayColor,
          allowedRoles: zone?.allowedRoles ?? [],
        };
        await zoneService.update(zone!.id, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{isNew ? 'Nueva zona' : `Editar zona: ${zone?.code}`}</DialogTitle>
      <DialogContent>
        {/* Preview top-down arriba para feedback inmediato. Click+drag
            sobre BOX/CYLINDER reposiciona el centro. */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <ZonePreview2D
            modelAabb={modelAabb}
            otherZones={otherZones.filter((z) => z.id !== zone?.id)}
            draftPolygon={polygon2d}
            draftColor={displayColor}
            draftBufferM={bufferApproachM}
            shapeType={shapeType}
            onDragCenter={(x, z) => { setCenterX(x); setCenterZ(z); }}
          />
        </Box>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Metadata */}
          <Stack direction="row" spacing={2}>
            <TextField
              label="Código"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeError) setCodeError(null);
              }}
              onBlur={async () => {
                if (!isNew) return;
                const c = code.trim();
                setCodeError(null);
                if (c === '') {
                  if (autoCode) setCode(autoCode);
                  return;
                }
                if (c === autoCode) return;
                try {
                  setCheckingCode(true);
                  const available = await zoneService.checkCode(plantId, c);
                  if (!available) setCodeError(`El código "${c}" ya está en uso en esta planta.`);
                } catch {
                  /* la unicidad final la garantiza el constraint backend */
                } finally {
                  setCheckingCode(false);
                }
              }}
              size="small"
              disabled={!isNew}
              required
              error={!!codeError}
              sx={{ flex: 1 }}
              helperText={
                codeError
                  ?? (isNew
                    ? (checkingCode
                      ? 'Comprobando disponibilidad...'
                      : 'Se sugiere automáticamente. Puedes cambiarlo; se valida al salir del campo.')
                    : 'No editable')
              }
            />
            <TextField
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              required
              sx={{ flex: 2 }}
            />
          </Stack>
          <TextField
            label="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            multiline
            minRows={2}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Tipo"
              value={type}
              onChange={(e) => setType(e.target.value as ZoneType)}
              size="small"
              sx={{ flex: 1 }}
            >
              {ZONE_TYPES.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Severity"
              type="number"
              value={severity}
              onChange={(e) => setSeverity(Math.max(1, Math.min(5, +e.target.value || 1)))}
              size="small"
              inputProps={{ min: 1, max: 5 }}
              sx={{ width: 120 }}
            />
            <TextField
              label="Color"
              type="color"
              value={displayColor}
              onChange={(e) => setDisplayColor(e.target.value)}
              size="small"
              sx={{ width: 100 }}
            />
            <TextField
              label="Buffer m"
              type="number"
              value={bufferApproachM}
              onChange={(e) => setBufferApproachM(Math.max(0, +e.target.value || 0))}
              size="small"
              inputProps={{ min: 0, step: 0.5 }}
              sx={{ width: 120 }}
              helperText="Distancia approach (m)"
            />
          </Stack>

          {/* Selector de primitiva */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Forma
            </Typography>
            <ToggleButtonGroup
              value={shapeType}
              exclusive
              onChange={(_, v) => v && setShapeType(v)}
              size="small"
              disabled={!isNew /* no permitir cambiar shape al editar para no perder geometría */}
            >
              <ToggleButton value="BOX"><BoxIcon fontSize="small" sx={{ mr: 0.5 }} />Cubo</ToggleButton>
              <ToggleButton value="CYLINDER"><CircleIcon fontSize="small" sx={{ mr: 0.5 }} />Cilindro</ToggleButton>
              <ToggleButton value="POLYGON"><PolylineIcon fontSize="small" sx={{ mr: 0.5 }} />Polígono</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Parámetros geométricos según primitiva */}
          {shapeType === 'BOX' && (
            <Stack direction="row" spacing={2}>
              <TextField label="Centro X" type="number" value={centerX} onChange={(e) => setCenterX(+e.target.value)} size="small" sx={{ flex: 1 }} />
              <TextField label="Centro Z" type="number" value={centerZ} onChange={(e) => setCenterZ(+e.target.value)} size="small" sx={{ flex: 1 }} />
              <TextField label="Tamaño X (m)" type="number" value={sizeX} onChange={(e) => setSizeX(Math.max(0.1, +e.target.value))} size="small" sx={{ flex: 1 }} />
              <TextField label="Tamaño Z (m)" type="number" value={sizeZ} onChange={(e) => setSizeZ(Math.max(0.1, +e.target.value))} size="small" sx={{ flex: 1 }} />
            </Stack>
          )}
          {shapeType === 'CYLINDER' && (
            <Stack direction="row" spacing={2}>
              <TextField label="Centro X" type="number" value={centerX} onChange={(e) => setCenterX(+e.target.value)} size="small" sx={{ flex: 1 }} />
              <TextField label="Centro Z" type="number" value={centerZ} onChange={(e) => setCenterZ(+e.target.value)} size="small" sx={{ flex: 1 }} />
              <TextField label="Radio (m)" type="number" value={radius} onChange={(e) => setRadius(Math.max(0.1, +e.target.value))} size="small" sx={{ flex: 1 }} />
            </Stack>
          )}
          {shapeType === 'POLYGON' && (
            <TextField
              label="Polígono (JSON: array de [x,y])"
              value={polygonText}
              onChange={(e) => setPolygonText(e.target.value)}
              size="small"
              multiline
              minRows={3}
              helperText="Avanzado: pegar array JSON de coords mundiales"
            />
          )}

          {/* Altura */}
          <Stack direction="row" spacing={2}>
            <TextField
              label="zMin (m)"
              type="number"
              value={zMin}
              onChange={(e) => setZMin(+e.target.value)}
              size="small"
              sx={{ flex: 1 }}
              helperText={
                modelAabb
                  ? `Suelo de la zona. Suelo del modelo: ${modelAabb.minY.toFixed(2)} m`
                  : 'Suelo de la zona (en coords mundiales del modelo)'
              }
            />
            <TextField
              label="zMax (m)"
              type="number"
              value={zMax}
              onChange={(e) => setZMax(+e.target.value)}
              size="small"
              sx={{ flex: 1 }}
              helperText={
                modelAabb
                  ? `Techo de la zona. Techo del modelo: ${modelAabb.maxY.toFixed(2)} m`
                  : 'Techo de la zona (en coords mundiales del modelo)'
              }
            />
          </Stack>

          {!isNew && (
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label="Zona activa"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ZoneEditDialog;
