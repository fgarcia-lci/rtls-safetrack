// Login — versión simplificada del DT, con MUI en vez de CSS externo.
// Auto-redirige al auth-server. Muestra mensajes de feedback (logout, error)
// si vienen como query params.

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Paper, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

type AuthErrorType = 'credentials' | 'locked' | 'expired' | 'generic';

export const Login: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [showLogoutMessage, setShowLogoutMessage] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorType | null>(null);
  const loginTriggered = useRef(false);

  useEffect(() => {
    if (searchParams.get('logout') === 'true') {
      setShowLogoutMessage(true);
      setAuthError(null);
    } else {
      const err = searchParams.get('error') as AuthErrorType | null;
      if (err) {
        setAuthError(err);
        setShowLogoutMessage(false);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (isLoading || isAuthenticated || loginTriggered.current) return;

    const delay = showLogoutMessage ? 3000 : authError ? 4000 : 0;
    const timer = setTimeout(() => {
      loginTriggered.current = true;
      login();
    }, delay);
    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, showLogoutMessage, authError, login]);

  if (isAuthenticated) return null;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)',
        p: 2,
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 480, width: '100%', textAlign: 'center' }}>
        {showLogoutMessage && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {t('login.logoutSuccess')}
          </Alert>
        )}
        {authError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {t(`login.error.${authError}`, { defaultValue: t('auth.loginError') })}
          </Alert>
        )}

        <Typography variant="h4" gutterBottom>
          {t('common.appName')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          {t('login.subtitle')}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">
            {t('login.redirecting')}
          </Typography>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
          LCi — Industrial engineering at the service of efficiency
        </Typography>
      </Paper>
    </Box>
  );
};

export default Login;
