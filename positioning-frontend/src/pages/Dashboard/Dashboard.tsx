// Placeholder — Fase 5 lo reemplaza por el dashboard con KPIs grandes,
// últimas alertas y mapa 2D embebido (ver docs/06_POC_PLAN.md).

import { Box, Typography, Paper } from '@mui/material';
import { useTranslation } from 'react-i18next';

export const Dashboard = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        {t('navigation.dashboard')}
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Typography color="text.secondary">
          Placeholder — KPIs, últimos eventos y mapa de la planta vendrán en Fase 5.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Dashboard;
