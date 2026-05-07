// Editor de zonas a página completa — reemplaza el ZoneEditDialog para
// dar contexto visual real (modelo XKT cargado en 3D + zonas existentes
// en gris + zona en edición se actualiza en vivo).
//
// Iteración 1 (este push): visualización + form. Sin drag manipulation.
// Iteración 2 (#53 cont.): drag XZ + arrow Y para mover sin tocar inputs.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  IconButton,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  CheckBoxOutlineBlank as BoxIcon,
  Circle as CircleIcon,
  Polyline as PolylineIcon,
  Rotate90DegreesCcw as RotateIcon,
  VerticalAlignBottom as SnapToFloorIcon,
} from '@mui/icons-material';
import {
  zoneService,
  type SafetyZoneCreatePayload,
  type SafetyZoneUpdatePayload,
} from '../../services/zoneService';
import { plantViewService } from '../../services/plantViewService';
import { config } from '../../config/config';
import {
  boxToPolygon,
  cylinderToPolygon,
  polygonToBox,
  polygonToCylinder,
  normalizeDeg,
} from './zoneShape';
import { ZoneEditor3DView } from './ZoneEditor3DView';
import type {
  SafetyZone,
  ShapeType,
  ZoneType,
} from '../../types/zones';
import type { PlantView } from '../Live/types';

const ZONE_TYPES: ZoneType[] = ['DANGER', 'RESTRICTED', 'WARNING', 'SAFE', 'INFO'];

const DEFAULT_COLOR_BY_TYPE: Record<ZoneType, string> = {
  DANGER: '#e63939',
  RESTRICTED: '#f5b91d',
  WARNING: '#f5b91d',
  SAFE: '#34c759',
  INFO: '#5b9bd5',
};

export function ZoneEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const plantId = config.plant.defaultId;
  const isNew = !id;
  const editingId = id ? Number(id) : null;

  // Carga inicial
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [zone, setZone] = useState<SafetyZone | null>(null);
  const [otherZones, setOtherZones] = useState<SafetyZone[]>([]);
  const [plantView, setPlantView] = useState<PlantView | null>(null);

  // Form
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
  const [rotationDeg, setRotationDeg] = useState(0);
  const [zMin, setZMin] = useState(64);
  const [zMax, setZMax] = useState(80);
  const [polygonText, setPolygonText] = useState('[]');

  // Estado UI
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Suelo del modelo (Y mundial) — se rellena cuando el visor 3D carga
  // el XKT. Usado para el botón "Al suelo" y como helper text.
  const [modelFloorY, setModelFloorY] = useState<number | null>(null);

  // Carga PlantView + zonas + zona en edición.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingInitial(true);
      try {
        const [views, zones] = await Promise.all([
          plantViewService.listForPlant(plantId),
          zoneService.listByPlant(plantId, false),
        ]);
        if (cancelled) return;
        const v = views.find((vw) => vw.type === 'MODEL_3D') ?? views[0];
        setPlantView(v ?? null);
        // Si editamos, carga la zona y separa el resto.
        if (editingId) {
          const target = zones.find((z) => z.id === editingId) ?? null;
          setZone(target);
          setOtherZones(zones.filter((z) => z.id !== editingId));
        } else {
          setOtherZones(zones);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error cargando datos');
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plantId, editingId]);

  // Inicializar form cuando se cargan datos. Edita: desde la zona.
  // Nuevo: defaults centrados en el modelo (modelAabb se conoce tras
  // primer model.aabb del visor).
  useEffect(() => {
    if (loadingInitial) return;
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
      if (zone.shapeType === 'BOX') {
        const b = polygonToBox(zone.polygon2d);
        setCenterX(b.centerX); setCenterZ(b.centerZ);
        setSizeX(b.sizeX); setSizeZ(b.sizeZ);
        setRotationDeg(b.rotationDeg ?? 0);
      } else if (zone.shapeType === 'CYLINDER') {
        const c = polygonToCylinder(zone.polygon2d);
        setCenterX(c.centerX); setCenterZ(c.centerZ);
        setRadius(c.radius);
      } else {
        setPolygonText(JSON.stringify(zone.polygon2d));
      }
    }
    // Si es nuevo: los defaults se setean en onModelLoaded del visor 3D.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingInitial, zone]);

  // Auto-color por tipo solo en creación.
  useEffect(() => {
    if (isNew && !loadingInitial) setDisplayColor(DEFAULT_COLOR_BY_TYPE[type]);
  }, [type, isNew, loadingInitial]);

  // Calcular polígono canónico actual (lo que se va a guardar y lo que el
  // visor 3D pinta como draft).
  const polygon2d = useMemo<[number, number][]>(() => {
    if (shapeType === 'BOX') return boxToPolygon({ centerX, centerZ, sizeX, sizeZ, rotationDeg });
    if (shapeType === 'CYLINDER') return cylinderToPolygon({ centerX, centerZ, radius });
    try { return JSON.parse(polygonText) as [number, number][]; } catch { return []; }
  }, [shapeType, centerX, centerZ, sizeX, sizeZ, radius, rotationDeg, polygonText]);

  const draftZoneForViewer = useMemo(() => ({
    polygon2d,
    zMin,
    zMax,
    displayColor,
  }), [polygon2d, zMin, zMax, displayColor]);

  const handleModelLoaded = (aabb: number[]) => {
    setModelFloorY(aabb[1]);
    // Solo aplicar defaults si es zona nueva y form aún no ha sido
    // tocado (centerX=0 indica fresh).
    if (!isNew) return;
    if (centerX !== 0 || centerZ !== 0) return;
    const cx = (aabb[0] + aabb[3]) / 2;
    const cz = (aabb[2] + aabb[5]) / 2;
    setCenterX(cx); setCenterZ(cz);
    setZMin(aabb[1]);
    setZMax(aabb[1] + 20);
  };

  /** Pone zMin = suelo del modelo manteniendo la altura actual. Si no
   *  hay modelFloorY (todavía cargando), no hace nada. */
  const handleSnapToFloor = () => {
    if (modelFloorY == null) return;
    const height = Math.max(0.1, zMax - zMin);
    setZMin(modelFloorY);
    setZMax(modelFloorY + height);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (isNew && !code.trim()) { setError('El código es obligatorio.'); return; }
    if (polygon2d.length < 3) { setError('El polígono debe tener al menos 3 vértices.'); return; }
    if (zMin >= zMax) { setError('zMin debe ser menor que zMax.'); return; }

    setSaving(true);
    try {
      if (isNew) {
        const payload: SafetyZoneCreatePayload = {
          plantId, code: code.trim(), name: name.trim(),
          description: description || null,
          type, shapeType, severity, polygon2d, zMin, zMax,
          bufferApproachM, displayColor, allowedRoles: [],
        };
        await zoneService.create(payload);
      } else {
        const payload: SafetyZoneUpdatePayload = {
          name: name.trim(), description: description || null,
          type, shapeType, severity, polygon2d, zMin, zMax,
          bufferApproachM, isActive, displayColor,
          allowedRoles: zone?.allowedRoles ?? [],
        };
        await zoneService.update(editingId!, payload);
      }
      navigate('/zones');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }} spacing={1}>
        <IconButton size="small" onClick={() => navigate('/zones')}>
          <BackIcon />
        </IconButton>
        <Typography variant="h6">
          {isNew ? 'Nueva zona' : `Editar zona: ${zone?.code ?? ''}`}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={() => navigate('/zones')} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

      {/* Body: 3D viewer (left) + form (right) */}
      <Box sx={{ flexGrow: 1, display: 'flex', minHeight: 0 }}>
        <Box sx={{ flexGrow: 1, position: 'relative', minWidth: 0 }}>
          <ZoneEditor3DView
            plantView={plantView}
            otherZones={otherZones}
            draftZone={draftZoneForViewer}
            onModelLoaded={handleModelLoaded}
            // El drag solo tiene sentido para BOX/CYLINDER (POLYGON tiene
            // vértices arbitrarios, no un "centro" que se pueda arrastrar).
            onDragCenter={
              shapeType === 'POLYGON'
                ? undefined
                : (x, z) => { setCenterX(x); setCenterZ(z); }
            }
            // Drag vertical de la flecha amarilla → setea zMin manteniendo
            // la altura. POLYGON también lo permite (la zona entera sube).
            onDragVerticalPosition={(newZMin) => {
              const h = zMax - zMin;
              setZMin(newZMin);
              setZMax(newZMin + h);
            }}
          />
        </Box>

        <Paper
          elevation={0}
          sx={{
            width: 380,
            borderLeft: 1,
            borderColor: 'divider',
            overflow: 'auto',
            p: 2.5,
          }}
        >
          <Stack spacing={2}>
            <Typography variant="overline" color="text.secondary">Identificación</Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Código"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                size="small"
                disabled={!isNew}
                required
                sx={{ flex: 1 }}
              />
            </Stack>
            <TextField
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="small"
              required
            />
            <TextField
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              size="small"
              multiline
              minRows={2}
            />

            <Divider />
            <Typography variant="overline" color="text.secondary">Clasificación</Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField select label="Tipo" value={type} onChange={(e) => setType(e.target.value as ZoneType)} size="small" sx={{ flex: 1 }}>
                {ZONE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField label="Severity" type="number" value={severity}
                onChange={(e) => setSeverity(Math.max(1, Math.min(5, +e.target.value || 1)))}
                size="small" inputProps={{ min: 1, max: 5 }} sx={{ width: 90 }} />
              <TextField label="Color" type="color" value={displayColor}
                onChange={(e) => setDisplayColor(e.target.value)}
                size="small" sx={{ width: 70 }} />
            </Stack>
            <TextField
              label="Buffer aproximación (m)"
              type="number"
              value={bufferApproachM}
              onChange={(e) => setBufferApproachM(Math.max(0, +e.target.value || 0))}
              size="small"
              inputProps={{ min: 0, step: 0.5 }}
              helperText="Distancia desde el borde a la que un operario empieza a contar como APPROACHING"
            />

            <Divider />
            <Typography variant="overline" color="text.secondary">Forma</Typography>
            <ToggleButtonGroup
              value={shapeType}
              exclusive
              onChange={(_, v) => v && setShapeType(v)}
              size="small"
              disabled={!isNew}
              fullWidth
            >
              <ToggleButton value="BOX"><BoxIcon fontSize="small" sx={{ mr: 0.5 }} />Cubo</ToggleButton>
              <ToggleButton value="CYLINDER"><CircleIcon fontSize="small" sx={{ mr: 0.5 }} />Cilindro</ToggleButton>
              <ToggleButton value="POLYGON"><PolylineIcon fontSize="small" sx={{ mr: 0.5 }} />Polígono</ToggleButton>
            </ToggleButtonGroup>

            {shapeType === 'BOX' && (
              <Stack spacing={1.5}>
                <Typography variant="caption" color="text.secondary">
                  Posición y dimensiones en el plano horizontal (X / Y).
                  Para altura usar zMin / zMax abajo.
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <TextField label="Centro X" type="number" value={centerX.toFixed(2)} onChange={(e) => setCenterX(+e.target.value)} size="small" sx={{ flex: 1 }} />
                  <TextField label="Centro Y" type="number" value={centerZ.toFixed(2)} onChange={(e) => setCenterZ(+e.target.value)} size="small" sx={{ flex: 1 }} />
                </Stack>
                <Stack direction="row" spacing={1.5}>
                  <TextField label="Ancho X (m)" type="number" value={sizeX} onChange={(e) => setSizeX(Math.max(0.1, +e.target.value))} size="small" sx={{ flex: 1 }} />
                  <TextField label="Largo Y (m)" type="number" value={sizeZ} onChange={(e) => setSizeZ(Math.max(0.1, +e.target.value))} size="small" sx={{ flex: 1 }} />
                </Stack>
                <TextField
                  label="Rotación (°)"
                  type="number"
                  value={rotationDeg.toFixed(1)}
                  onChange={(e) => setRotationDeg(normalizeDeg(+e.target.value || 0))}
                  size="small"
                  inputProps={{ step: 5 }}
                  helperText="Giro en el plano horizontal alrededor del centro. 0 = alineado a ejes mundo."
                  InputProps={{
                    startAdornment: <RotateIcon fontSize="small" sx={{ mr: 1, color: 'action.active' }} />,
                  }}
                />
              </Stack>
            )}
            {shapeType === 'CYLINDER' && (
              <Stack spacing={1.5}>
                <Typography variant="caption" color="text.secondary">
                  Posición y radio en el plano horizontal. Para altura usar
                  zMin / zMax abajo.
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <TextField label="Centro X" type="number" value={centerX.toFixed(2)} onChange={(e) => setCenterX(+e.target.value)} size="small" sx={{ flex: 1 }} />
                  <TextField label="Centro Y" type="number" value={centerZ.toFixed(2)} onChange={(e) => setCenterZ(+e.target.value)} size="small" sx={{ flex: 1 }} />
                  <TextField label="Radio (m)" type="number" value={radius} onChange={(e) => setRadius(Math.max(0.1, +e.target.value))} size="small" sx={{ flex: 1 }} />
                </Stack>
              </Stack>
            )}
            {shapeType === 'POLYGON' && (
              <TextField
                label="Polígono (JSON [[x,y],...])"
                value={polygonText}
                onChange={(e) => setPolygonText(e.target.value)}
                size="small" multiline minRows={3}
              />
            )}

            <Divider />
            <Typography variant="overline" color="text.secondary">Eje vertical (altura y posición)</Typography>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Posición vertical (m)"
                type="number"
                value={zMin}
                onChange={(e) => {
                  const newPos = +e.target.value;
                  const h = zMax - zMin;        // mantener altura
                  setZMin(newPos);
                  setZMax(newPos + h);
                }}
                size="small"
                sx={{ flex: 1 }}
                helperText="Y mundial donde queda el suelo del cubo"
              />
              <TextField
                label="Altura (m)"
                type="number"
                value={(zMax - zMin).toFixed(2)}
                onChange={(e) => {
                  const newH = Math.max(0.1, +e.target.value || 0.1);
                  setZMax(zMin + newH);          // mantener posición
                }}
                size="small"
                inputProps={{ min: 0.1, step: 0.5 }}
                sx={{ flex: 1 }}
                helperText="Grosor vertical del prisma"
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
              zMin {Number(zMin).toFixed(2)} → zMax {Number(zMax).toFixed(2)} m
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SnapToFloorIcon />}
              onClick={handleSnapToFloor}
              disabled={modelFloorY == null || zMin === modelFloorY}
              sx={{ alignSelf: 'flex-start' }}
            >
              {modelFloorY != null
                ? `Bajar al suelo (${modelFloorY.toFixed(2)} m)`
                : 'Bajar al suelo'}
            </Button>

            {!isNew && (
              <FormControlLabel
                control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                label="Zona activa"
              />
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}

export default ZoneEditorPage;
