import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { tagService } from '../../services/tagService';
import { config } from '../../config/config';
import type { Tag } from '../../types/tag';

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: Mode;
  initial?: Tag | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  serial: string;
  model: string;
  vendor: string;
  firmwareVersion: string;
  plantId: string;
  notes: string;
}

const empty = (): FormState => ({
  serial: '',
  model: '',
  vendor: '',
  firmwareVersion: '',
  plantId: config.plant.defaultId,
  notes: '',
});

export function TagDialog({ open, mode, initial, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(empty());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initial) {
      setForm({
        serial: initial.serial,
        model: initial.model ?? '',
        vendor: initial.vendor ?? '',
        firmwareVersion: initial.firmwareVersion ?? '',
        plantId: initial.plantId,
        notes: initial.notes ?? '',
      });
    } else {
      setForm(empty());
    }
    setError(null);
  }, [open, mode, initial]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        model: form.model.trim() || null,
        vendor: form.vendor.trim() || null,
        firmwareVersion: form.firmwareVersion.trim() || null,
        plantId: form.plantId.trim(),
        notes: form.notes.trim() || null,
      };
      if (mode === 'create') {
        await tagService.create({ ...payload, serial: form.serial.trim() });
      } else if (initial) {
        await tagService.update(initial.id, payload);
      }
      onSaved();
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

  const isValid = form.serial.trim() && form.plantId.trim();

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'create' ? t('tags.dialog.createTitle') : t('tags.dialog.editTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('tags.dialog.fields.serial')}
            value={form.serial}
            onChange={(e) => update('serial', e.target.value)}
            disabled={mode === 'edit' || submitting}
            required
            fullWidth
            placeholder="AA:BB:CC:DD:EE:FF"
            sx={{ '& input': { fontFamily: 'monospace' } }}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label={t('tags.dialog.fields.model')}
              value={form.model}
              onChange={(e) => update('model', e.target.value)}
              disabled={submitting}
              fullWidth
            />
            <TextField
              label={t('tags.dialog.fields.vendor')}
              value={form.vendor}
              onChange={(e) => update('vendor', e.target.value)}
              disabled={submitting}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label={t('tags.dialog.fields.firmwareVersion')}
              value={form.firmwareVersion}
              onChange={(e) => update('firmwareVersion', e.target.value)}
              disabled={submitting}
              fullWidth
            />
            <TextField
              label={t('tags.dialog.fields.plantId')}
              value={form.plantId}
              onChange={(e) => update('plantId', e.target.value)}
              disabled={submitting}
              required
              fullWidth
            />
          </Stack>
          <TextField
            label={t('tags.dialog.fields.notes')}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            disabled={submitting}
            multiline
            rows={2}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!isValid || submitting}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default TagDialog;
