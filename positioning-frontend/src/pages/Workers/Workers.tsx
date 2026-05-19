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
  TablePagination,
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
  MyLocation as MyLocationIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { workerService } from '../../services/workerService';
import { useAuth } from '../../context/AuthContext';
import { WorkerDialog } from './WorkerDialog';
import type { CompanyType, PageResponse, Worker } from '../../types/worker';

type CompanyFilter = '' | CompanyType;
type ActiveFilter = '' | 'true' | 'false';

const useDebounced = <T,>(value: T, delay = 300): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
};

export function Workers() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isAdmin = useMemo(() => user?.roles?.includes('ROLE_ADMIN') ?? false, [user]);

  const [search, setSearch] = useState('');
  const [companyType, setCompanyType] = useState<CompanyFilter>('');
  const [isActive, setIsActive] = useState<ActiveFilter>('true');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const debouncedSearch = useDebounced(search);

  const [data, setData] = useState<PageResponse<Worker> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Worker | null>(null);

  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await workerService.list({
        search: debouncedSearch || undefined,
        companyType: companyType || undefined,
        isActive: isActive === '' ? undefined : isActive === 'true',
        page,
        size: pageSize,
        sort: 'fullName,asc',
      });
      setData(result);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      setError(e.response?.status === 403 ? t('auth.noPermission') : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, companyType, isActive, page, pageSize, t]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handleCreate = () => {
    setDialogMode('create');
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (w: Worker) => {
    setDialogMode('edit');
    setEditing(w);
    setDialogOpen(true);
  };

  const handleDelete = async (w: Worker) => {
    if (!window.confirm(t('workers.deleteConfirm', { name: w.fullName }))) return;
    try {
      await workerService.softDelete(w.id);
      setToast({ msg: t('workers.toast.deleted'), severity: 'success' });
      fetchPage();
    } catch {
      setToast({ msg: t('common.error'), severity: 'error' });
    }
  };

  const handleLocate = (w: Worker) => {
    // Navega a Live con focusWorker (selecciona la pildora) + follow=true
    // (activa modo seguimiento de cámara). Si el worker no tiene tag o
    // no hay posiciones recientes, Live mostrará el estado "sin posición".
    navigate(`/live?focusWorker=${w.id}&follow=true`);
  };

  const handleSaved = () => {
    setToast({
      msg: dialogMode === 'create' ? t('workers.toast.created') : t('workers.toast.updated'),
      severity: 'success',
    });
    fetchPage();
  };

  const companyTypeColor: Record<CompanyType, 'primary' | 'secondary' | 'default'> = {
    INTERNAL: 'primary',
    CONTRACTOR: 'secondary',
    VISITOR: 'default',
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        {t('navigation.workers')}
      </Typography>

      <Paper>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder={t('workers.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            sx={{ minWidth: 280 }}
          />
          <TextField
            select
            size="small"
            label={t('workers.dialog.fields.companyType')}
            value={companyType}
            onChange={(e) => {
              setPage(0);
              setCompanyType(e.target.value as CompanyFilter);
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">{t('workers.allCompanyTypes')}</MenuItem>
            <MenuItem value="INTERNAL">{t('workers.companyType.INTERNAL')}</MenuItem>
            <MenuItem value="CONTRACTOR">{t('workers.companyType.CONTRACTOR')}</MenuItem>
            <MenuItem value="VISITOR">{t('workers.companyType.VISITOR')}</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label={t('workers.dialog.fields.isActive')}
            value={isActive}
            onChange={(e) => {
              setPage(0);
              setIsActive(e.target.value as ActiveFilter);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">{t('workers.allStates')}</MenuItem>
            <MenuItem value="true">{t('common.active')}</MenuItem>
            <MenuItem value="false">{t('common.inactive')}</MenuItem>
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          {isAdmin && (
            <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreate}>
              {t('workers.createButton')}
            </Button>
          )}
        </Toolbar>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('workers.columns.employeeCode')}</TableCell>
                <TableCell>{t('workers.columns.fullName')}</TableCell>
                <TableCell>{t('workers.columns.companyName')}</TableCell>
                <TableCell>{t('workers.columns.companyType')}</TableCell>
                <TableCell>{t('workers.columns.email')}</TableCell>
                <TableCell>{t('workers.columns.isActive')}</TableCell>
                <TableCell align="right">{t('workers.columns.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && (data?.content.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {t('workers.noResults')}
                  </TableCell>
                </TableRow>
              )}
              {!loading && data?.content.map((w) => (
                <TableRow key={w.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{w.employeeCode}</TableCell>
                  <TableCell>{w.fullName}</TableCell>
                  <TableCell>{w.companyName}</TableCell>
                  <TableCell>
                    <Chip
                      label={t(`workers.companyType.${w.companyType}`)}
                      color={companyTypeColor[w.companyType]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{w.email ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={w.isActive ? t('common.active') : t('common.inactive')}
                      color={w.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title={t('workers.actions.viewDetail', 'Ver ficha')}>
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/workers/${w.id}`)}
                        >
                          <PersonIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('workers.actions.locateOn3D', 'Localizar en 3D')}>
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            disabled={!w.isActive}
                            onClick={() => handleLocate(w)}
                          >
                            <MyLocationIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {isAdmin && (
                        <>
                          <Tooltip title={t('common.edit')}>
                            <IconButton size="small" onClick={() => handleEdit(w)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('common.delete')}>
                            <IconButton size="small" color="error" onClick={() => handleDelete(w)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
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

        <TablePagination
          component="div"
          count={data?.totalElements ?? 0}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Paper>

      <WorkerDialog
        open={dialogOpen}
        mode={dialogMode}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

export default Workers;
