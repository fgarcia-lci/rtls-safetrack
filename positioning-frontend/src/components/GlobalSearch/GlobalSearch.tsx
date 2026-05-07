// Búsqueda global tipo command palette: vive en el AppBar, sirve para
// localizar operarios, tags y zonas desde cualquier vista. Resultado:
//   - Operario / Tag → /live?focusTag=SERIAL → Live abre WorkerInfoPanel.
//   - Zona            → /zones/editor/:id (página de edición ya existente).
import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  TextField,
  Typography,
} from '@mui/material';
import {
  Search as SearchIcon,
  Person as PersonIcon,
  Sensors as SensorsIcon,
  Warning as ZoneIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { searchService, type SearchResult } from '../../services/searchService';
import { config } from '../../config/config';

const GROUP_LABEL: Record<SearchResult['type'], string> = {
  WORKER: 'Operarios',
  TAG: 'Tags',
  ZONE: 'Zonas',
};

const GROUP_ICON: Record<SearchResult['type'], React.ReactNode> = {
  WORKER: <PersonIcon fontSize="small" />,
  TAG: <SensorsIcon fontSize="small" />,
  ZONE: <ZoneIcon fontSize="small" />,
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const plantId = config.plant.defaultId;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [options, setOptions] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce 220ms para no saturar al servidor.
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 220);
    return () => clearTimeout(h);
  }, [query]);

  useEffect(() => {
    if (!debounced || debounced.trim().length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchService.search(plantId, debounced)
      .then((r) => { if (!cancelled) setOptions(r); })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, plantId]);

  const handleSelect = (val: SearchResult | null) => {
    if (!val) return;
    if (val.type === 'WORKER') {
      // Operario → buscar su tag y abrir panel. El backend devuelve el id
      // del worker; en /live el panel se abre por serial del tag, no por
      // workerId. Workaround: navegar con focusWorker=ID y dejar a Live
      // que resuelva el primer tag del worker.
      navigate(`/live?focusWorker=${val.id}`);
    } else if (val.type === 'TAG') {
      navigate(`/live?focusTag=${encodeURIComponent(val.identifier)}`);
    } else if (val.type === 'ZONE') {
      navigate(`/zones/editor/${val.id}`);
    }
    // Limpia el input tras la selección.
    setQuery('');
    setOptions([]);
  };

  return (
    <Autocomplete<SearchResult, false, false, false>
      sx={{
        width: { xs: 200, sm: 320, md: 380 },
        bgcolor: 'rgba(255,255,255,0.12)',
        borderRadius: 1,
        '& .MuiOutlinedInput-root': {
          color: 'inherit',
          '& fieldset': { borderColor: 'rgba(255,255,255,0.18)' },
          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
        },
        '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.6)' },
      }}
      options={options}
      filterOptions={(x) => x}
      groupBy={(o) => o.type}
      getOptionLabel={(o) => o.label}
      isOptionEqualToValue={(a, b) => a.type === b.type && a.id === b.id}
      loading={loading}
      noOptionsText={
        debounced.length < 2
          ? 'Escribe al menos 2 caracteres'
          : 'Sin resultados'
      }
      onInputChange={(_, value, reason) => {
        if (reason === 'reset') return;
        setQuery(value);
      }}
      onChange={(_, val) => handleSelect(val)}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          placeholder="Buscar operario, tag o zona…"
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <SearchIcon fontSize="small" sx={{ color: 'rgba(255,255,255,0.6)', ml: 0.5, mr: 0.5 }} />
            ),
          }}
        />
      )}
      renderGroup={(params) => (
        <li key={params.key}>
          <Box sx={{
            px: 2, py: 0.5,
            fontSize: 11, fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: 'action.hover',
          }}>
            {GROUP_ICON[params.group as SearchResult['type']]}
            {GROUP_LABEL[params.group as SearchResult['type']]}
          </Box>
          <ul style={{ padding: 0, margin: 0 }}>{params.children}</ul>
        </li>
      )}
      renderOption={(props, option) => (
        <li {...props} key={`${option.type}-${option.id}`}>
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {option.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {option.sublabel}
            </Typography>
          </Box>
        </li>
      )}
    />
  );
}

export default GlobalSearch;
