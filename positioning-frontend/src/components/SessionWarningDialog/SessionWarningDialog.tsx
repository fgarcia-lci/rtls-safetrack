// Dialog que aparece cuando el refresh automático del token ha fallado
// y al access token le queda < 1 min para caducar. El usuario puede
// reintentar el refresh manualmente o cerrar sesión.

import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, CircularProgress } from '@mui/material';
import { AccessTime as ClockIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

export function SessionWarningDialog() {
  const { t } = useTranslation();
  const { showSessionWarning, tryRefreshNow, logout, dismissSessionWarning } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setBusy(true);
    setError(null);
    const ok = await tryRefreshNow();
    setBusy(false);
    if (!ok) setError(t('session.warningError'));
  };

  const handleLogout = () => {
    dismissSessionWarning();
    logout();
  };

  return (
    <Dialog open={showSessionWarning} disableEscapeKeyDown>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ClockIcon color="warning" />
          <span>{t('session.warningTitle')}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Typography>{t('session.warningMessage')}</Typography>
        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleLogout} color="inherit" disabled={busy}>
          {t('session.logout')}
        </Button>
        <Button
          onClick={handleContinue}
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} /> : undefined}
        >
          {busy ? t('session.renewing') : t('session.continueButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SessionWarningDialog;
