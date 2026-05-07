// Callback — clonado del DT, simplificado con MUI (sin .css externo) y con
// localStorage key adaptada (`safetrack_return_to`).

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material';
import { useAuth } from '../../context/AuthContext';

function classifyAuthError(
  errorCode: string | null,
  errorDescription: string | null,
): 'credentials' | 'locked' | 'expired' | 'generic' {
  const desc = (errorDescription ?? '').toLowerCase();
  const code = (errorCode ?? '').toLowerCase();
  if (desc.includes('locked') || desc.includes('disabled') || desc.includes('bloqueado')) return 'locked';
  if (
    desc.includes('bad credentials') ||
    desc.includes('invalid credentials') ||
    desc.includes('credenciales') ||
    code === 'access_denied'
  )
    return 'credentials';
  if (desc.includes('expired') || desc.includes('expirad')) return 'expired';
  return 'generic';
}

export const Callback: React.FC = () => {
  const navigate = useNavigate();
  const { handleCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  useEffect(() => {
    const processCallback = async () => {
      if (hasProcessed.current) return;
      hasProcessed.current = true;

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const errorParam = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');

      if (errorParam) {
        const errorType = classifyAuthError(errorParam, errorDescription);
        setError(errorDescription || errorParam);
        setTimeout(() => navigate(`/login?error=${errorType}`, { replace: true }), 2000);
        return;
      }

      if (!code || !state) {
        setError('Parámetros de autenticación inválidos');
        setTimeout(() => navigate('/login?error=generic', { replace: true }), 2000);
        return;
      }

      try {
        await handleCallback(code, state);
        const returnTo = localStorage.getItem('safetrack_return_to');
        localStorage.removeItem('safetrack_return_to');
        navigate(returnTo || '/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error de autenticación');
        setTimeout(() => navigate('/login?error=generic', { replace: true }), 2000);
      }
    };
    processCallback();
  }, [handleCallback, navigate]);

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
        {error ? (
          <>
            <Alert severity="error" sx={{ mb: 2 }}>
              <strong>Error de Autenticación</strong>
              <div>{error}</div>
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Redirigiendo al login...
            </Typography>
          </>
        ) : (
          <>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Procesando autenticación...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Por favor espera mientras verificamos tus credenciales
            </Typography>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default Callback;
