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
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  OpenInNew as OpenInNewIcon,
  BatteryFull,
  Battery60,
  Battery30,
  BatteryAlert,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { tagService } from '../../services/tagService';
import { useAuth } from '../../context/AuthContext';
import { TagDialog } from './TagDialog';
import { AssignDialog } from './AssignDialog';
import type { PageResponse } from '../../types/worker';
import type { Tag, TagStateValue } from '../../types/tag';

const useDebounced = <T,>(value: T, delay = 300): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
};

function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return 'now';
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function BatteryIcon({ pct }: { pct?: number | null }) {
  if (pct == null) return <span>—</span>;
  if (pct >= 75) return <BatteryFull color="success" />;
  if (pct >= 40) return <Battery60 color="success" />;
  if (pct >= 20) return <Battery30 color="warning" />;
  return <BatteryAlert color="error" />;
}

const STATE_COLOR: Record<TagStateValue, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
  ACTIVE: 'success',
  IDLE: 'info',
  LOW_BATTERY: 'warning',
  LOST: 'error',
  UNKNOWN: 'default',
  DECOMMISSIONED: 'default',
};

type StateFilter = '' | TagStateValue;
type AssignedFilter = '' | 'true' | 'false';

export function Tags() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = useMemo(() => user?.roles?.includes('ROLE_ADMIN') ?? false, [user]);
  const canAssign = useMemo(() =>
    user?.roles?.some((r) => r === 'ROLE_ADMIN' || r === 'ROLE_OPERATOR') ?? false,
  [user]);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('');
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const debouncedSearch = useDebounced(search);

  const [data, setData] = useState<PageResponse<Tag> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [crudOpen, setCrudOpen] = useState(false);
  const [crudMode, setCrudMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Tag | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Tag | null>(null);

  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  // Tick para refrescar relativeTime mostrado
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tagService.list({
        search: debouncedSearch || undefined,
        state: stateFilter || undefined,
        isAssigned: assignedFilter === '' ? undefined : assignedFilter === 'true',
        page,
        size: pageSize,
        sort: 'serial,asc',
      });
      setData(result);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      setError(e.response?.status === 403 ? t('auth.noPermission') : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, stateFilter, assignedFilter, page, pageSize, t]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const handleCreate = () => { setCrudMode('create'); setEditing(null); setCrudOpen(true); };
  const handleEdit = (t: Tag) => { setCrudMode('edit'); setEditing(t); setCrudOpen(true); };

  const handleDelete = async (tag: Tag) => {
    if (!window.confirm(t('tags.decommissionConfirm', { serial: tag.serial }))) return;
    try {
      await tagService.decommission(tag.id);
      setToast({ msg: t('tags.toast.decommissioned'), severity: 'success' });
      fetchPage();
    } catch {
      setToast({ msg: t('common.error'), severity: 'error' });
    }
  };

  const handleUnassign = async (tag: Tag) => {
    try {
      await tagService.unassign(tag.id);
      setToast({ msg: t('tags.toast.unassigned'), severity: 'success' });
      fetchPage();
    } catch {
      setToast({ msg: t('common.error'), severity: 'error' });
    }
  };

  const handleAssignClick = (tag: Tag) => {
    setAssignTarget(tag);
    setAssignOpen(true);
  };

  const handleAssigned = () => {
    setToast({ msg: t('tags.toast.assigned'), severity: 'success' });
    fetchPage();
  };

  const handleSaved = () => {
    setToast({
      msg: crudMode === 'create' ? t('tags.toast.created') : t('tags.toast.updated'),
      severity: 'success',
    });
    fetchPage();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>{t('navigation.tags')}</Typography>

      <Paper>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder={t('tags.searchPlaceholder')}
            value={search}
            onChange={(e) => { setPage(0); setSearch(e.target.value); }}
            sx={{ minWidth: 280 }}
          />
          <TextField
            select size="small"
            label={t('tags.columns.state')}
            value={stateFilter}
            onChange={(e) => { setPage(0); setStateFilter(e.target.value as StateFilter); }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">{t('tags.allStates')}</MenuItem>
            {(['ACTIVE','IDLE','LOW_BATTERY','LOST','UNKNOWN','DECOMMISSIONED'] as TagStateValue[]).map((s) => (
              <MenuItem key={s} value={s}>{t(`tags.state.${s}`)}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small"
            label={t('tags.columns.assignment')}
            value={assignedFilter}
            onChange={(e) => { setPage(0); setAssignedFilter(e.target.value as AssignedFilter); }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">{t('tags.allAssignment')}</MenuItem>
            <MenuItem value="true">{t('tags.assigned')}</MenuItem>
            <MenuItem value="false">{t('tags.unassigned')}</MenuItem>
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          {isAdmin && (
            <Button startIcon={<AddIcon />} variant="contained" onClick={handleCreate}>
              {t('tags.createButton')}
            </Button>
          )}
        </Toolbar>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('tags.columns.serial')}</TableCell>
                <TableCell>{t('tags.columns.model')}</TableCell>
                <TableCell>{t('tags.columns.state')}</TableCell>
                <TableCell align="center">{t('tags.columns.battery')}</TableCell>
                <TableCell>{t('tags.columns.assignment')}</TableCell>
                <TableCell>{t('tags.columns.lastSeen')}</TableCell>
                <TableCell align="right">{t('tags.columns.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              )}
              {!loading && (data?.content.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>{t('tags.noResults')}</TableCell></TableRow>
              )}
              {!loading && data?.content.map((tag) => (
                <TableRow
                  key={tag.id}
                  hover
                  onClick={() => navigate(`/tags/${tag.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontFamily: 'monospace' }}>{tag.serial}</TableCell>
                  <TableCell>{tag.model ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t(`tags.state.${tag.state}`)}
                      color={STATE_COLOR[tag.state]}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={tag.batteryLastPct != null ? `${tag.batteryLastPct}%` : '—'}>
                      <span><BatteryIcon pct={tag.batteryLastPct} /></span>
                    </Tooltip>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {tag.assignedWorkerName ? (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <span
                          style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                          onClick={() => tag.assignedWorkerId && navigate(`/workers/${tag.assignedWorkerId}`)}
                        >
                          {tag.assignedWorkerName}
                        </span>
                        <Typography variant="caption" color="text.secondary">({tag.assignedWorkerCode})</Typography>
                        {canAssign && tag.state !== 'DECOMMISSIONED' && (
                          <Tooltip title={t('tags.unassignTooltip')}>
                            <IconButton size="small" onClick={() => handleUnassign(tag)}>
                              <LinkOffIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    ) : (
                      canAssign && tag.state !== 'DECOMMISSIONED' ? (
                        <Button size="small" startIcon={<LinkIcon />} onClick={() => handleAssignClick(tag)}>
                          {t('tags.assignButton')}
                        </Button>
                      ) : <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>{relativeTime(tag.lastSeenAt)}</TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title={t('tags.actions.viewDetail', 'Ver ficha')}>
                        <IconButton size="small" color="primary" onClick={() => navigate(`/tags/${tag.id}`)}>
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {isAdmin && (
                        <>
                          <Tooltip title={t('common.edit')}>
                            <IconButton size="small" onClick={() => handleEdit(tag)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('tags.decommission')}>
                            <IconButton size="small" color="error" onClick={() => handleDelete(tag)}>
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
          onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Paper>

      <TagDialog
        open={crudOpen}
        mode={crudMode}
        initial={editing}
        onClose={() => setCrudOpen(false)}
        onSaved={handleSaved}
      />
      <AssignDialog
        open={assignOpen}
        tag={assignTarget}
        onClose={() => setAssignOpen(false)}
        onAssigned={handleAssigned}
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

export default Tags;
