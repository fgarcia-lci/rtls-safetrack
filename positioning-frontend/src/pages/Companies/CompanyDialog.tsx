// Dialog de creación / edición de empresa.
//
// V14: la empresa tiene su propio teléfono + email obligatorios; el manager
// personal pasa a ser opcional. Esto evita el "huevo y la gallina" de "no
// puedo crear empresa sin manager, no puedo dar de alta al manager hasta
// asignarle una empresa".
//
// El dialog se puede invocar también desde otros formularios (p.ej. desde
// WorkerDialog → "+ Nueva empresa") mediante la prop `onCreated`, que
// devuelve la empresa creada para que el caller la auto-seleccione.

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
  Divider,
  Typography,
} from '@mui/material';
import { companyService } from '../../services/companyService';
import { supervisorService } from '../../services/supervisorService';
import type { Company, CompanyUpsertPayload } from '../../types/company';
import type { CompanyType, Worker } from '../../types/worker';

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: Mode;
  initial?: Company | null;
  onClose: () => void;
  /** Llamado al guardar. Recibe la empresa creada o editada — el caller puede
   *  usarla para auto-seleccionar (p.ej. desde el dropdown de un WorkerDialog). */
  onSaved: (company: Company) => void;
}

interface FormState {
  name: string;
  type: CompanyType;
  phone: string;
  email: string;
  managerPersonId: number | '';
  managerNotes: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: '',
  type: 'CONTRACTOR',
  phone: '',
  email: '',
  managerPersonId: '',
  managerNotes: '',
  isActive: true,
};

export function CompanyDialog({ open, mode, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [managers, setManagers] = useState<Worker[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingManagers(true);
    supervisorService.list(true)
      .then((all) => setManagers(all.filter((p) => p.isCompanyManager)))
      .catch(() => setManagers([]))
      .finally(() => setLoadingManagers(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initial) {
      setForm({
        name: initial.name,
        type: initial.type,
        phone: initial.phone ?? '',
        email: initial.email ?? '',
        managerPersonId: initial.managerPersonId ?? '',
        managerNotes: initial.managerNotes ?? '',
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
      const payload: CompanyUpsertPayload = {
        name: form.name.trim(),
        type: form.type,
        phone: form.phone.trim(),
        email: form.email.trim(),
        managerPersonId: form.managerPersonId === '' ? null : Number(form.managerPersonId),
        managerNotes: form.managerNotes.trim() || null,
        isActive: form.isActive,
      };
      const saved = mode === 'create'
        ? await companyService.create(payload)
        : await companyService.update(initial!.id, payload);
      onSaved(saved);
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string }; status?: number } };
      setError(e.response?.data?.message ?? 'Error al guardar la empresa');
    } finally {
      setSubmitting(false);
    }
  };

  const formValid = form.name.trim() && form.phone.trim() && form.email.trim();

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'create' ? 'Nueva empresa' : `Editar empresa: ${initial?.name ?? ''}`}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Nombre de la empresa"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            disabled={submitting}
            required
            fullWidth
            helperText="Único en el sistema. Ej: LCi, Contrata Industrial XYZ"
          />

          <TextField
            select
            label="Tipo"
            value={form.type}
            onChange={(e) => update('type', e.target.value as CompanyType)}
            disabled={submitting}
            required
          >
            <MenuItem value="INTERNAL">Interna</MenuItem>
            <MenuItem value="CONTRACTOR">Subcontrata</MenuItem>
            <MenuItem value="VISITOR">Visitante</MenuItem>
          </TextField>

          <Divider />
          <Typography variant="overline" color="text.secondary">Contacto general (centralita)</Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Teléfono"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              disabled={submitting}
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              disabled={submitting}
              required
              fullWidth
            />
          </Stack>

          <Divider />
          <Typography variant="overline" color="text.secondary">Manager (opcional)</Typography>
          <TextField
            select
            label="Manager de la empresa"
            value={form.managerPersonId}
            onChange={(e) => update('managerPersonId', e.target.value === '' ? '' : Number(e.target.value))}
            disabled={submitting || loadingManagers}
            helperText={
              managers.length === 0 && !loadingManagers
                ? 'No hay personas marcadas como manager — puedes asignar uno más adelante.'
                : 'Persona de contacto personal. Si está, se usa para escalado adicional.'
            }
          >
            <MenuItem value="">(Sin manager asignado)</MenuItem>
            {managers.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.fullName}
                {m.phone ? ` · ${m.phone}` : ''}
                {m.email ? ` · ${m.email}` : ''}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Notas sobre el manager"
            value={form.managerNotes}
            onChange={(e) => update('managerNotes', e.target.value)}
            disabled={submitting}
            multiline
            rows={2}
            fullWidth
            helperText="Opcional: horario de contacto, instrucciones especiales, etc."
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
              label="Empresa activa"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!formValid || submitting}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CompanyDialog;
