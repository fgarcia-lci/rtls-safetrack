// Placeholder — Fase 5 trae el histórico de eventos con filtros y export CSV.

import { Box, Typography, Paper } from '@mui/material';
import { useTranslation } from 'react-i18next';

export const Events = () => {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        {t('navigation.events')}
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Typography color="text.secondary">
          {t('events.placeholder')}
        </Typography>
      </Paper>
    </Box>
  );
};

export default Events;
