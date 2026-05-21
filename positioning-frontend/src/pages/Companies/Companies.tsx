// CRUD de empresas. Listado simple en tabla con búsqueda por nombre +
// filtros por tipo y estado. La gestión del manager se hace desde el
// dialog — el manager se elige entre personas con isCompanyManager=true,
// flag que se marca en la ficha de trabajador.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Toolbar,
  TextField,
  MenuItem,
  Button,
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Business as BusinessIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { companyService } from '../../services/companyService';
import { useAuth } from '../../context/AuthContext';
import { CompanyDialog } from './CompanyDialog';
import type { Company } from '../../types/company';
import type { CompanyType } from '../../types/worker';

type TypeFilter = '' | CompanyType;
type ActiveFilter = '' | 'true' | 'false';

const TYPE_LABEL: Record<CompanyType, string> = {
  INTERNAL: 'Interna',
  CONTRACTOR: 'Subcontrata',
  VISITOR: 'Visitante',
};

const TYPE_COLOR: Record<CompanyType, 'success' | 'info' | 'secondary'> = {
  INTERNAL: 'success',
  CONTRACTOR: 'info',
  VISITOR: 'secondary',
};

export const Companies = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = useMemo(
    () => user?.roles?.includes('ROLE_ADMIN') ?? false,
    [user],
  );

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('true');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Company | null>(null);
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isActive = activeFilter === '' ? undefined : activeFilter === 'true';
      const data = await companyService.list(isActive);
      setCompanies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando empresas');
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => { load(); }, [load]);

  // Filtrado client-side por search + type. El backend no soporta esos
  // filtros y no nos interesa añadirlos por unas decenas de filas.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q)
          || (c.managerName ?? '').toLowerCase().includes(q);
    });
  }, [companies, search, typeFilter]);

  const handleCreate = () => {
    setDialogMode('create');
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (c: Company) => {
    setDialogMode('edit');
    setEditing(c);
    setDialogOpen(true);
  };

  const handleDelete = async (c: Company) => {
    if (!confirm(`¿Dar de baja a la empresa "${c.name}"?`)) return;
    try {
      await companyService.softDelete(c.id);
      setToast({ msg: 'Empresa dada de baja', sev: 'success' });
      load();
    } catch (err) {
      setToast({
        msg: err instanceof Error ? err.message : 'Error al dar de baja',
        sev: 'error',
      });
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4">Empresas</Typography>
        {isAdmin && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreate}>
            Nueva empresa
          </Button>
        )}
      </Stack>

      <Paper>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar por nombre o manager..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 260 }}
          />
          <TextField
            select size="small" label="Tipo"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Todos los tipos</MenuItem>
            <MenuItem value="INTERNAL">Interna</MenuItem>
            <MenuItem value="CONTRACTOR">Subcontrata</MenuItem>
            <MenuItem value="VISITOR">Visitante</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Estado"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="true">Activas</MenuItem>
            <MenuItem value="false">Inactivas</MenuItem>
          </TextField>
        </Toolbar>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Empresa</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Contacto centralita</TableCell>
                <TableCell>Manager</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress size={24} sx={{ my: 2 }} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No se encontraron empresas.
                  </TableCell>
                </TableRow>
              )}
              {!loading && filtered.map((c) => (
                <TableRow
                  key={c.id}
                  hover
                  onClick={() => navigate(`/companies/${c.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <BusinessIcon fontSize="small" color="action" />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={TYPE_LABEL[c.type]}
                      color={TYPE_COLOR[c.type]}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Stack spacing={0.25}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption">
                          <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{c.phone}</a>
                        </Typography>
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <EmailIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption">
                          <a href={`mailto:${c.email}`} style={{ color: 'inherit' }}>{c.email}</a>
                        </Typography>
                      </Stack>
                    </Stack>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {c.managerName ? (
                      <Stack spacing={0.25}>
                        <Typography variant="body2">{c.managerName}</Typography>
                        {c.managerPhone && (
                          <Typography variant="caption" color="text.secondary">
                            <a href={`tel:${c.managerPhone}`} style={{ color: 'inherit' }}>
                              {c.managerPhone}
                            </a>
                          </Typography>
                        )}
                        {c.managerEmail && (
                          <Typography variant="caption" color="text.secondary">
                            <a href={`mailto:${c.managerEmail}`} style={{ color: 'inherit' }}>
                              {c.managerEmail}
                            </a>
                          </Typography>
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.disabled">Sin asignar</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={c.isActive ? 'Activa' : 'Inactiva'}
                      color={c.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Ver ficha">
                        <IconButton size="small" color="primary" onClick={() => navigate(`/companies/${c.id}`)}>
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {isAdmin && (
                        <>
                          <Tooltip title="Editar">
                            <IconButton size="small" onClick={() => handleEdit(c)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Dar de baja">
                            <span>
                              <IconButton size="small" color="error" onClick={() => handleDelete(c)} disabled={!c.isActive}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <CompanyDialog
        open={dialogOpen}
        mode={dialogMode}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setToast({
            msg: dialogMode === 'create' ? 'Empresa creada' : 'Empresa actualizada',
            sev: 'success',
          });
          load();
        }}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? <Alert severity={toast.sev}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default Companies;
