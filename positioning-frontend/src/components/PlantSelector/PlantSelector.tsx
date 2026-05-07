// PlantSelector — versión simplificada para PoC.
//
// Por ahora muestra la planta piloto (TSP3) hardcoded desde config.plant.defaultId.
// Cuando tengamos endpoint /v1/plants y multi-planta, se enriquece con el patrón
// del DT (Redux + healthMap + selector con búsqueda).

import React from 'react';
import { Box, Typography } from '@mui/material';
import { Factory as FactoryIcon } from '@mui/icons-material';
import { config } from '../../config/config';

interface PlantSelectorProps {
  compact?: boolean;
}

export const PlantSelector: React.FC<PlantSelectorProps> = ({ compact = false }) => {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
      <FactoryIcon fontSize={compact ? 'small' : 'medium'} />
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {config.plant.defaultId}
      </Typography>
    </Box>
  );
};

export default PlantSelector;
