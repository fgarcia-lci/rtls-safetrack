import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  FormControlLabel,
  Switch,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { workerService } from '../../services/workerService';
import type { CompanyType, Worker } from '../../types/worker';

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: Mode;
  initial?: Worker | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  employeeCode: string;
  fullName: string;
  phone: string;
  email: string;
  companyName: string;
  companyType: CompanyType;
  roleInPlant: string;
  hireDate: string;
  notes: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  employeeCode: '',
  fullName: '',
  phone: '',
  email: '',
  companyName: '',
  companyType: 'INTERNAL',
  roleInPlant: '',
  hireDate: '',
  notes: '',
  isActive: true,
};

export function WorkerDialog({ open, mode, initial, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initial) {
      setForm({
        employeeCode: initial.employeeCode,
        fullName: initial.fullName,
        phone: initial.phone ?? '',
        email: initial.email ?? '',
        companyName: initial.companyName,
        companyType: initial.companyType,
        roleInPlant: initial.roleInPlant ?? '',
        hireDate: initial.hireDate ?? '',
        notes: initial.notes ?? '',
        isActive: initial.isActive,
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [open, mode, initial]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        companyName: form.companyName.trim(),
        companyType: form.companyType,
        roleInPlant: form.roleInPlant.trim() || null,
        hireDate: form.hireDate || null,
        notes: form.notes.trim() || null,
      };
      if (mode === 'create') {
        await workerService.create({
          ...payload,
          employeeCode: form.employeeCode.trim(),
        });
      } else if (initial) {
        await workerService.update(initial.id, {
          ...payload,
          isActive: form.isActive,
        });
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

  const isFormValid = form.employeeCode.trim() && form.fullName.trim() && form.companyName.trim();

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'create' ? t('workers.dialog.createTitle') : t('workers.dialog.editTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('workers.dialog.fields.employeeCode')}
            value={form.employeeCode}
            onChange={(e) => update('employeeCode', e.target.value)}
            disabled={mode === 'edit' || submitting}
            required
            fullWidth
          />
          <TextField
            label={t('workers.dialog.fields.fullName')}
            value={form.fullName}
            onChange={(e) => update('fullName', e.target.value)}
            disabled={submitting}
            required
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label={t('workers.dialog.fields.companyName')}
              value={form.companyName}
              onChange={(e) => update('companyName', e.target.value)}
              disabled={submitting}
              required
              fullWidth
            />
            <TextField
              select
              label={t('workers.dialog.fields.companyType')}
              value={form.companyType}
              onChange={(e) => update('companyType', e.target.value as CompanyType)}
              disabled={submitting}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="INTERNAL">{t('workers.companyType.INTERNAL')}</MenuItem>
              <MenuItem value="CONTRACTOR">{t('workers.companyType.CONTRACTOR')}</MenuItem>
              <MenuItem value="VISITOR">{t('workers.companyType.VISITOR')}</MenuItem>
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label={t('workers.dialog.fields.email')}
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              disabled={submitting}
              fullWidth
            />
            <TextField
              label={t('workers.dialog.fields.phone')}
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              disabled={submitting}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label={t('workers.dialog.fields.roleInPlant')}
              value={form.roleInPlant}
              onChange={(e) => update('roleInPlant', e.target.value)}
              disabled={submitting}
              fullWidth
            />
            <TextField
              label={t('workers.dialog.fields.hireDate')}
              type="date"
              value={form.hireDate}
              onChange={(e) => update('hireDate', e.target.value)}
              disabled={submitting}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
          <TextField
            label={t('workers.dialog.fields.notes')}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            disabled={submitting}
            multiline
            rows={2}
            fullWidth
          />
          {mode === 'edit' && (
            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={(e) => update('isActive', e.target.checked)}
                  disabled={submitting}
                />
              }
              label={t('workers.dialog.fields.isActive')}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isFormValid || submitting}
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default WorkerDialog;
