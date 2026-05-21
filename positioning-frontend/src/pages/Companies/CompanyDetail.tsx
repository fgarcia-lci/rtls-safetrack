// Ficha de empresa /companies/:id.
//
// Muestra los datos institucionales de la empresa (centralita + manager) y
// la lista de empleados asignados al catálogo (cualquier rol: trabajador en
// planta, supervisor, manager). Es el destino del botón "Ver ficha empresa"
// del WorkerDetail y del botón "Ficha empresa" del panel live.

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Avatar,
  Divider,
  CircularProgress,
  Alert,
  Button,
  IconButton,
  Tooltip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TextField,
  MenuItem,
  Snackbar,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  Edit as EditIcon,
  Person as PersonIcon,
  SupervisorAccount as SupervisorIcon,
  ManageAccounts as ManagerIcon,
  Warning as WarningIcon,
  School as PrlIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { companyService } from '../../services/companyService';
import { useAuth } from '../../context/AuthContext';
import { CompanyDialog } from './CompanyDialog';
import type { Company } from '../../types/company';
import type { CompanyType, Worker } from '../../types/worker';

const TYPE_LABEL: Record<CompanyType, string> = {
  INTERNAL: 'Interna',
  CONTRACTOR: 'Subcontrata',
  VISITOR: 'Visitante',
};

const TYPE_COLOR: Record<CompanyType, string> = {
  INTERNAL: '#34c759',
  CONTRACTOR: '#3a8ee0',
  VISITOR: '#9b5fc7',
};

type RoleFilter = 'all' | 'worker' | 'supervisor' | 'manager';

function initials(name?: string | null): string {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function isPrlExpired(w: Worker): boolean {
  if (!w.lastPrlTrainingDate) return false;
  const last = new Date(w.lastPrlTrainingDate);
  const validUntil = new Date(last);
  validUntil.setMonth(validUntil.getMonth() + (w.prlValidMonths ?? 12));
  return validUntil < new Date();
}

export function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.roles?.includes('ROLE_ADMIN') ?? false, [user]);

  const companyId = Number(id);

  const [company, setCompany] = useState<Company | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(companyId)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      companyService.getById(companyId),
      companyService.listWorkers(companyId),
    ])
      .then(([c, ws]) => {
        if (!cancelled) { setCompany(c); setWorkers(ws); }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando empresa');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, refreshTick]);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (roleFilter === 'worker' && !w.isWorkerInPlant) return false;
      if (roleFilter === 'supervisor' && !w.isSupervisor) return false;
      if (roleFilter === 'manager' && !w.isCompanyManager) return false;
      if (!q) return true;
      return w.fullName.toLowerCase().includes(q)
          || w.employeeCode.toLowerCase().includes(q)
          || (w.roleInPlant ?? '').toLowerCase().includes(q);
    });
  }, [workers, search, roleFilter]);

  // KPIs simples para la cabecera — sin endpoint específico, derivados del
  // listado ya cargado.
  const stats = useMemo(() => ({
    total: workers.length,
    active: workers.filter((w) => w.isActive).length,
    inPlant: workers.filter((w) => w.isWorkerInPlant).length,
    supervisors: workers.filter((w) => w.isSupervisor).length,
    prlExpired: workers.filter(isPrlExpired).length,
  }), [workers]);

  if (!Number.isFinite(companyId)) {
    return <Alert severity="error" sx={{ m: 3 }}>ID de empresa inválido.</Alert>;
  }
  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  if (error || !company) {
    return <Alert severity="error" sx={{ m: 3 }}>{error ?? 'Empresa no encontrada'}</Alert>;
  }

  const headerBg = TYPE_COLOR[company.type];

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Cabecera con identidad de empresa + contactos */}
      <Paper sx={{ overflow: 'hidden', mb: 3 }}>
        <Box sx={{
          background: `linear-gradient(135deg, ${headerBg} 0%, ${headerBg}cc 100%)`,
          color: '#fff', p: 3, position: 'relative',
        }}>
          <Tooltip title="Volver al listado de empresas">
            <IconButton size="small" onClick={() => navigate('/companies')}
              sx={{ position: 'absolute', top: 12, left: 12, color: '#fff' }}>
              <BackIcon />
            </IconButton>
          </Tooltip>
          {isAdmin && (
            <Tooltip title="Editar empresa">
              <IconButton size="small" onClick={() => setEditOpen(true)}
                sx={{ position: 'absolute', top: 12, right: 12, color: '#fff' }}>
                <EditIcon />
              </IconButton>
            </Tooltip>
          )}
          <Stack direction="row" spacing={3} alignItems="center" sx={{ pl: 5, pr: 5 }}>
            <Avatar sx={{
              width: 80, height: 80, fontSize: 32, fontWeight: 700,
              bgcolor: 'rgba(255,255,255,0.22)',
              border: '3px solid rgba(255,255,255,0.45)',
            }}>
              <BusinessIcon sx={{ fontSize: 44 }} />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" sx={{ fontWeight: 600 }}>{company.name}</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                <Chip size="small" label={TYPE_LABEL[company.type]}
                  sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 600 }} />
                {!company.isActive && (
                  <Chip size="small" label="Inactiva"
                    sx={{ bgcolor: 'rgba(0,0,0,0.4)', color: '#fff' }} />
                )}
              </Stack>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ p: 3 }}>
          <Stack direction="row" spacing={4} flexWrap="wrap">
            {/* Columna izquierda: centralita */}
            <Box sx={{ flex: 1, minWidth: 280 }}>
              <Typography variant="overline" color="text.secondary">Centralita</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body1">
                    <a href={`tel:${company.phone}`} style={{ color: 'inherit' }}>{company.phone}</a>
                  </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <EmailIcon fontSize="small" color="action" />
                  <Typography variant="body1">
                    <a href={`mailto:${company.email}`} style={{ color: 'inherit' }}>{company.email}</a>
                  </Typography>
                </Stack>
              </Stack>
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Columna central: manager */}
            <Box sx={{ flex: 1, minWidth: 280 }}>
              <Typography variant="overline" color="text.secondary">Manager personal</Typography>
              {company.managerName ? (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                    onClick={() => company.managerPersonId && navigate(`/workers/${company.managerPersonId}`)}
                  >
                    {company.managerName}
                  </Typography>
                  {company.managerPhone && (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <PhoneIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        <a href={`tel:${company.managerPhone}`} style={{ color: 'inherit' }}>{company.managerPhone}</a>
                      </Typography>
                    </Stack>
                  )}
                  {company.managerEmail && (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <EmailIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        <a href={`mailto:${company.managerEmail}`} style={{ color: 'inherit' }}>{company.managerEmail}</a>
                      </Typography>
                    </Stack>
                  )}
                  {company.managerNotes && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {company.managerNotes}
                    </Typography>
                  )}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
                  Sin manager asignado.
                </Typography>
              )}
            </Box>

            <Divider orientation="vertical" flexItem />

            {/* Columna derecha: KPIs */}
            <Box sx={{ flex: 1, minWidth: 280 }}>
              <Typography variant="overline" color="text.secondary">Personal asignado</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, mt: 1 }}>
                <KpiMini label="Total" value={stats.total} />
                <KpiMini label="Activos" value={stats.active} color="success.main" />
                <KpiMini label="En planta" value={stats.inPlant} />
                <KpiMini label="Supervisores" value={stats.supervisors} />
                <KpiMini
                  label="PRL caducado"
                  value={stats.prlExpired}
                  color={stats.prlExpired > 0 ? 'error.main' : undefined}
                />
              </Box>
            </Box>
          </Stack>
        </Box>
      </Paper>

      {/* Lista de empleados */}
      <Paper>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flex: 1, minWidth: 200 }}>Empleados</Typography>
          <TextField
            size="small" placeholder="Buscar por nombre, código o puesto..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 260 }}
          />
          <TextField
            select size="small" label="Rol"
            value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">Todos los roles</MenuItem>
            <MenuItem value="worker">Trabajadores en planta</MenuItem>
            <MenuItem value="supervisor">Supervisores</MenuItem>
            <MenuItem value="manager">Managers</MenuItem>
          </TextField>
        </Stack>

        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Trabajador</TableCell>
              <TableCell>Código</TableCell>
              <TableCell>Puesto</TableCell>
              <TableCell>Roles</TableCell>
              <TableCell>PRL</TableCell>
              <TableCell>Contacto</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredWorkers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {workers.length === 0
                    ? 'Esta empresa todavía no tiene empleados asignados.'
                    : 'Ningún empleado coincide con los filtros.'}
                </TableCell>
              </TableRow>
            )}
            {filteredWorkers.map((w) => (
              <TableRow key={w.id} hover>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={1}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/workers/${w.id}`)}
                  >
                    <Avatar src={w.photoUrl ?? undefined} sx={{ width: 32, height: 32, fontSize: 13 }}>
                      {initials(w.fullName)}
                    </Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{w.fullName}</Typography>
                    {!w.isActive && (
                      <Chip size="small" label="Inactivo" color="default" sx={{ height: 18 }} />
                    )}
                  </Stack>
                </TableCell>
                <TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{w.employeeCode}</Typography></TableCell>
                <TableCell>{w.roleInPlant ?? '—'}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    {w.isWorkerInPlant && (
                      <Tooltip title="Trabajador en planta"><PersonIcon fontSize="small" color="action" /></Tooltip>
                    )}
                    {w.isSupervisor && (
                      <Tooltip title="Supervisor"><SupervisorIcon fontSize="small" color="primary" /></Tooltip>
                    )}
                    {w.isCompanyManager && (
                      <Tooltip title="Manager de empresa"><ManagerIcon fontSize="small" color="secondary" /></Tooltip>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  {!w.lastPrlTrainingDate ? (
                    <Chip size="small" label="Sin registro" variant="outlined" />
                  ) : isPrlExpired(w) ? (
                    <Chip size="small" icon={<WarningIcon />} label="Caducado" color="error" />
                  ) : (
                    <Chip size="small" icon={<PrlIcon />} label="Vigente" color="success" variant="outlined" />
                  )}
                </TableCell>
                <TableCell>
                  <Stack spacing={0.25}>
                    {w.phone && (
                      <Typography variant="caption">
                        <a href={`tel:${w.phone}`} style={{ color: 'inherit' }}>{w.phone}</a>
                      </Typography>
                    )}
                    {w.email && (
                      <Typography variant="caption">
                        <a href={`mailto:${w.email}`} style={{ color: 'inherit' }}>{w.email}</a>
                      </Typography>
                    )}
                    {!w.phone && !w.email && '—'}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => navigate(`/workers/${w.id}`)}>Ver ficha</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <CompanyDialog
        open={editOpen}
        mode="edit"
        initial={company}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setToast('Empresa actualizada');
          setRefreshTick((n) => n + 1);
        }}
      />

      <Snackbar
        open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? <Alert severity="success">{toast}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

function KpiMini({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, color: color ?? 'text.primary' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default CompanyDetail;
