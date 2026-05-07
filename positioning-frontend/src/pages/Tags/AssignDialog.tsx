import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Autocomplete,
  TextField,
  Alert,
  Box,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Sensors as SensorsIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { workerService } from '../../services/workerService';
import { tagService } from '../../services/tagService';
import type { CompanyType, Tag } from '../../types/tag';
import type { Worker } from '../../types/worker';

const COMPANY_COLOR: Record<CompanyType, string> = {
  INTERNAL: '#34c759',
  CONTRACTOR: '#3a8ee0',
  VISITOR: '#9b5fc7',
};

interface Props {
  open: boolean;
  tag: Tag | null;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignDialog({ open, tag, onClose, onAssigned }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mapa workerId → lista de tags ya asignados a ese worker. Permite
  // marcar en el autocomplete los operarios que YA tienen tag (con el
  // serial al lado), para que el usuario sepa si va a asignar un segundo
  // tag (caso real: trabajadores con tag de empresa + tag visitante, etc.).
  const [workerTagsMap, setWorkerTagsMap] = useState<Record<number, Tag[]>>({});

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await workerService.list({
          search: search || undefined,
          isActive: true,
          page: 0,
          size: 20,
          sort: 'fullName,asc',
        });
        setOptions(result.content);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [open, search]);

  // Fetch de todos los tags ya asignados para construir el mapa workerId → tags.
  useEffect(() => {
    if (!open || !tag) return;
    let cancelled = false;
    tagService.list({ plantId: tag.plantId, isAssigned: true, size: 500 })
      .then((res) => {
        if (cancelled) return;
        const map: Record<number, Tag[]> = {};
        for (const t of res.content) {
          if (t.assignedWorkerId == null) continue;
          if (!map[t.assignedWorkerId]) map[t.assignedWorkerId] = [];
          map[t.assignedWorkerId].push(t);
        }
        setWorkerTagsMap(map);
      })
      .catch(() => setWorkerTagsMap({}));
    return () => { cancelled = true; };
  }, [open, tag]);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setSearch('');
      setError(null);
    }
  }, [open]);

  // ¿El worker seleccionado ya tiene tag(s)? Sirve para el aviso.
  const selectedHasTags = selected ? (workerTagsMap[selected.id]?.length ?? 0) > 0 : false;

  const dialogTitle = useMemo(() => {
    if (!tag) return '';
    return t('tags.assignDialog.title', { serial: tag.serial });
  }, [tag, t]);

  const handleAssign = async () => {
    if (!tag || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await tagService.assign(tag.id, selected.id);
      onAssigned();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string }; status?: number } };
      const msg = e.response?.data?.message
        ?? (e.response?.status === 403 ? t('auth.noPermission') : t('common.error'));
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Aviso visible cuando se ha elegido un worker que ya tiene tag(s).
            No bloquea la asignación — un worker puede tener varios tags. */}
        {selectedHasTags && selected && (
          <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
            <strong>{selected.fullName}</strong> ya tiene asignado{' '}
            {workerTagsMap[selected.id].length === 1
              ? 'un tag'
              : `${workerTagsMap[selected.id].length} tags`}
            :{' '}
            {workerTagsMap[selected.id]
              .map((tg) => tg.serial)
              .join(', ')}
            . ¿Seguro que quieres asignar otro?
          </Alert>
        )}

        <Autocomplete
          autoFocus
          loading={loading}
          options={options}
          value={selected}
          onChange={(_, value) => setSelected(value)}
          inputValue={search}
          onInputChange={(_, value) => setSearch(value)}
          getOptionLabel={(o) => `${o.fullName} (${o.employeeCode})`}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          filterOptions={(x) => x}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('tags.assignDialog.searchLabel')}
              placeholder={t('workers.searchPlaceholder')}
              sx={{ mt: 1 }}
            />
          )}
          renderOption={(props, option) => {
            const assignedTags = workerTagsMap[option.id] ?? [];
            const hasTag = assignedTags.length > 0;
            const dotColor = COMPANY_COLOR[option.companyType] ?? '#888';
            return (
              <li {...props} key={option.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                  {/* Bullet de color por companyType */}
                  <Box sx={{
                    width: 10, height: 10, borderRadius: '50%',
                    bgcolor: dotColor, flexShrink: 0,
                  }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <span>{option.fullName}</span>
                      {hasTag && (
                        <Tooltip title={
                          assignedTags.length === 1
                            ? `Tag asignado: ${assignedTags[0].serial}`
                            : `${assignedTags.length} tags: ${assignedTags.map((t) => t.serial).join(', ')}`
                        }>
                          <Chip
                            size="small"
                            icon={<SensorsIcon sx={{ fontSize: 14 }} />}
                            label={assignedTags.length === 1
                              ? assignedTags[0].serial
                              : `${assignedTags.length} tags`}
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              fontFamily: 'monospace',
                              bgcolor: 'warning.light',
                              color: 'warning.contrastText',
                            }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                    <Box sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.6)' }}>
                      {option.employeeCode} · {option.companyName}
                    </Box>
                  </Box>
                </Box>
              </li>
            );
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
        <Button
          onClick={handleAssign}
          variant="contained"
          disabled={!selected || submitting}
        >
          {t('tags.assignDialog.assign')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AssignDialog;
