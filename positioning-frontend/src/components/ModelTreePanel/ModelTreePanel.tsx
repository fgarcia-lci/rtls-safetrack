// ModelTreePanel — árbol jerárquico de visibilidad del modelo XKT.
//
// Sobre `TreeViewPlugin` de xeokit-sdk. Tres jerarquías (containment /
// types / storeys). Usuario puede:
//   - Cambiar la jerarquía
//   - Buscar nodos por nombre — los resultados aparecen en una LISTA
//     PLANA debajo del buscador (no se manipula el árbol; con modelos
//     grandes expandir + filtrar el árbol entero saturaba el DOM)
//   - Mostrar / ocultar a granel los resultados de la búsqueda
//   - Expandir o colapsar todo el árbol
//   - Ocultar/mostrar nodos individuales con los checkboxes nativos
//
// Persistencia: hidden + collapsed nodes se guardan por usuario en BD
// (endpoint /v1/user-view-prefs/{plantViewId}).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Paper, IconButton, Typography, Stack, Tooltip, TextField,
  ToggleButton, ToggleButtonGroup, Button, InputAdornment, List, ListItem,
  ListItemButton, ListItemText, Checkbox,
} from '@mui/material';
import {
  AccountTree as AccountTreeIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  VisibilityOff as VisibilityOffIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  UnfoldMore as UnfoldMoreIcon,
  UnfoldLess as UnfoldLessIcon,
} from '@mui/icons-material';
import { TreeViewPlugin } from '@xeokit/xeokit-sdk';
import { useTranslation } from 'react-i18next';
import { useViewPrefs } from '../../hooks/useViewPrefs';

type Hierarchy = 'containment' | 'types' | 'storeys';

interface Props {
  plantViewId: number | null;
  viewerWindowKey?: string;
}

const HIERARCHY_KEYS: Record<Hierarchy, string> = {
  containment: 'tree.hierarchy.containment',
  types: 'tree.hierarchy.types',
  storeys: 'tree.hierarchy.storeys',
};

interface SearchHit {
  id: string;
  name: string;
  type: string;
}

export function ModelTreePanel({ plantViewId, viewerWindowKey = '__rtlsViewer' }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hierarchy, setHierarchy] = useState<Hierarchy>('types');
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<TreeViewPlugin | null>(null);
  const [ready, setReady] = useState(false);
  // Bump on every external visibility change (search list actions). MUI
  // checkboxes in the results list read `scene.objects[id].visible` during
  // render — without this tick they would stay stale after setObjectsVisible.
  const [visibilityTick, setVisibilityTick] = useState(0);

  const { prefs, loaded: prefsLoaded, update: updatePrefs } = useViewPrefs(plantViewId);
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  const updatePrefsRef = useRef(updatePrefs);
  useEffect(() => { updatePrefsRef.current = updatePrefs; }, [updatePrefs]);
  const initialHiddenAppliedRef = useRef(false);
  // El árbol arranca siempre colapsado (`autoExpandDepth: 0`) y no
  // persistimos collapsedNodeIds — suscribirse a los eventos del plugin
  // para guardarlo causaba freezes al colapsar/expandir padres grandes.
  const hiddenSetRef = useRef<Set<string>>(new Set());

  // Poll de readiness — el viewer + el metaModel se crean async.
  useEffect(() => {
    if (!open) return;
    let active = true;
    const checkReady = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (window as any)[viewerWindowKey];
      const ok = !!v && typeof v === 'object' && 'metaScene' in v
        && Object.keys((v as { metaScene: { metaModels: Record<string, unknown> } }).metaScene.metaModels).length > 0;
      if (ok) setReady(true);
      else if (active) setTimeout(checkReady, 250);
    };
    checkReady();
    return () => { active = false; };
  }, [open, viewerWindowKey]);

  // Crear / recrear el plugin al abrir o cambiar la jerarquía.
  useEffect(() => {
    if (!open || !ready || !containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;

    try {
      // Limpia HTML residual del plugin anterior — al cambiar de jerarquía
      // el plugin no siempre vacía su contenedor (IfcSite duplicado).
      if (containerRef.current) containerRef.current.innerHTML = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plugin = new TreeViewPlugin(v as any, {
        containerElement: containerRef.current,
        hierarchy,
        autoExpandDepth: 0,
      });
      pluginRef.current = plugin;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__rtlsTreeView = plugin;
      initialHiddenAppliedRef.current = false;

      // Click en título → highlight + flyTo.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (plugin as any).on?.('nodeTitleClicked', (e: { treeViewNode?: { objectId?: string } }) => {
        const objectId = e.treeViewNode?.objectId;
        if (!objectId) return;
        try {
          v.scene.setObjectsHighlighted(v.scene.highlightedObjectIds, false);
          v.scene.setObjectsHighlighted([objectId], true);
        } catch { /* ignore */ }
        try {
          const ent = v.scene.objects[objectId];
          if (ent && ent.aabb) v.cameraFlight.flyTo({ aabb: ent.aabb, duration: 0.5 });
        } catch { /* ignore */ }
      });

      // NOTA: temporalmente NO suscribimos a `nodeCollapsed`/`nodeExpanded`.
      // Al colapsar un padre con muchos hijos el plugin emite N eventos
      // (uno por nivel) y cada uno disparaba un setState/scheduleSave que
      // bajo carga se traduce en re-renders en cadena y notably en
      // freezes visibles. La persistencia del colapso se hace ahora al
      // cerrar el panel (effect de cleanup) capturando el estado del DOM.
    } catch (err) {
      console.error('[ModelTreePanel] Failed to create TreeViewPlugin', err);
    }

    return () => {
      initialHiddenAppliedRef.current = false;
      try { pluginRef.current?.destroy?.(); } catch { /* ignore */ }
      pluginRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { delete (window as any).__rtlsTreeView; } catch { /* ignore */ }
    };
  }, [open, ready, viewerWindowKey, hierarchy]);

  // Aplicar estado guardado UNA vez tras montar el plugin + cargar prefs.
  useEffect(() => {
    if (!open || !ready || !prefsLoaded) return;
    if (initialHiddenAppliedRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;
    const plugin = pluginRef.current;
    if (!plugin) return;

    const hidden = prefs.hiddenNodeIds ?? [];
    hiddenSetRef.current = new Set(hidden);
    if (hidden.length > 0) {
      try {
        const scene = v.scene;
        const validIds = hidden.filter((id: string) => scene.objects[id]);
        if (validIds.length > 0) scene.setObjectsVisible(validIds, false);
      } catch { /* ignore */ }
    }
    initialHiddenAppliedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, prefsLoaded, viewerWindowKey, hierarchy]);

  // Tracking de visibility por DOM delegation. Antes escuchábamos el
  // evento `scene.on('objectVisibility')` que dispara MILES de veces en
  // cascada al togglear un padre con muchos hijos. Aquí sólo nos llega
  // el evento `change` del checkbox que el USUARIO toca: O(1) por click.
  // Después, en el debounce, leemos el estado actual del scene una sola
  // vez para serializar a BD.
  useEffect(() => {
    if (!open || !ready) return;
    const container = containerRef.current;
    if (!container) return;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t || t.tagName !== 'INPUT' || t.type !== 'checkbox') return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = (window as any)[viewerWindowKey];
        if (!v) return;
        const hidden: string[] = [];
        for (const id of Object.keys(v.scene.objects)) {
          if (v.scene.objects[id]?.visible === false) hidden.push(id);
        }
        hiddenSetRef.current = new Set(hidden);
        updatePrefsRef.current({ hiddenNodeIds: hidden });
      }, 2500);
    };
    container.addEventListener('change', onChange);
    return () => {
      container.removeEventListener('change', onChange);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [open, ready, viewerWindowKey, hierarchy]);

  // ===== Operaciones de árbol =====
  const showAll = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;
    try { v.scene.setObjectsVisible(v.scene.objectIds, true); } catch { /* ignore */ }
  };
  const hideAll = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;
    try { v.scene.setObjectsVisible(v.scene.objectIds, false); } catch { /* ignore */ }
  };
  const expandAll = () => {
    const plugin = pluginRef.current;
    const container = containerRef.current;
    if (!plugin) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { (plugin as any).expandToDepth?.(99); } catch { /* ignore */ }
    if (!container) return;
    for (let pass = 0; pass < 6; pass++) {
      const pluses = container.querySelectorAll('a.plus');
      if (pluses.length === 0) break;
      pluses.forEach((a) => (a as HTMLAnchorElement).click());
    }
  };
  const collapseAll = () => {
    // Truco rápido: en lugar de clicar cada `a.minus` (que provoca N
    // reflows secuenciales), destruimos el plugin y lo recreamos con
    // autoExpandDepth=0. El DOM se vacía y reconstruye en un sólo
    // ciclo de layout — perceptiblemente instantáneo incluso con
    // árboles enormes.
    const plugin = pluginRef.current;
    const container = containerRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!plugin || !container || !v) return;
    try { plugin.destroy?.(); } catch { /* ignore */ }
    pluginRef.current = null;
    container.innerHTML = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fresh = new TreeViewPlugin(v as any, {
        containerElement: container,
        hierarchy,
        autoExpandDepth: 0,
      });
      pluginRef.current = fresh;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__rtlsTreeView = fresh;
    } catch (err) {
      console.error('[ModelTreePanel] collapseAll: recreate failed', err);
    }
  };

  // ===== Búsqueda en LISTA PLANA (no toca el árbol) =====
  // Recorre `metaScene.metaObjects` y filtra por nombre o tipo. Los
  // resultados se muestran como lista debajo del buscador con checkbox
  // de visibilidad individual y botones de acción a granel.
  const searchResults: SearchHit[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !ready) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return [];
    const meta = v.metaScene?.metaObjects ?? {};
    const out: SearchHit[] = [];
    for (const id of Object.keys(meta)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = meta[id] as any;
      const name: string = (m?.name ?? '');
      const type: string = (m?.type ?? '');
      if (!name && !type) continue;
      if (name.toLowerCase().includes(q) || type.toLowerCase().includes(q)) {
        // Sólo nos quedamos con entidades reales (tienen entry en
        // scene.objects). Los nodos agrupadores del metaScene no son
        // togglables por visibility.
        if (v.scene.objects[id]) out.push({ id, name: name || `(${type})`, type });
      }
    }
    // Orden alfabético por nombre para que la lista sea estable.
    out.sort((a, b) => a.name.localeCompare(b.name));
    // Cap defensivo — si hay miles de hits, renderizar todos petaría.
    return out.slice(0, 500);
  }, [searchQuery, ready, hierarchy, viewerWindowKey]);

  // Read current scene visibility and persist the hidden ID list to BD.
  // Used for search-list interactions: those don't go through the tree's
  // DOM checkbox `change` listener so the auto-save never kicks in.
  const persistHiddenNow = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;
    const hidden: string[] = [];
    for (const id of Object.keys(v.scene.objects)) {
      if (v.scene.objects[id]?.visible === false) hidden.push(id);
    }
    hiddenSetRef.current = new Set(hidden);
    updatePrefsRef.current({ hiddenNodeIds: hidden });
  };

  const setResultsVisible = (visible: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;
    const ids = searchResults.map((r) => r.id);
    if (ids.length === 0) return;
    try { v.scene.setObjectsVisible(ids, visible); } catch { /* ignore */ }
    setVisibilityTick((n) => n + 1);
    persistHiddenNow();
  };

  const toggleResultVisible = (id: string, visible: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;
    try { v.scene.setObjectsVisible([id], visible); } catch { /* ignore */ }
    setVisibilityTick((n) => n + 1);
    persistHiddenNow();
  };

  const flyToResult = (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (window as any)[viewerWindowKey];
    if (!v) return;
    try {
      v.scene.setObjectsHighlighted(v.scene.highlightedObjectIds, false);
      v.scene.setObjectsHighlighted([id], true);
    } catch { /* ignore */ }
    try {
      const ent = v.scene.objects[id];
      if (ent?.aabb) v.cameraFlight.flyTo({ aabb: ent.aabb, duration: 0.5 });
    } catch { /* ignore */ }
  };

  // ===== Render =====
  const handleHierarchyChange = (_: unknown, val: Hierarchy | null) => {
    if (val) setHierarchy(val);
  };

  const treeCardSx = useMemo(() => ({
    mt: 1,
    maxHeight: 'calc(100vh - 320px)',
    overflowY: 'auto' as const,
    overflowX: 'auto' as const,
    border: 1,
    borderColor: 'divider',
    borderRadius: 1,
    p: 0.5,
    fontSize: 12,
    bgcolor: 'background.default',
    '& ul': { listStyle: 'none', paddingLeft: '18px', margin: 0 },
    '& > ul': { paddingLeft: 0 },
    '& li': {
      margin: 0,
      padding: '1px 0',
      whiteSpace: 'nowrap' as const,
      display: 'block',
      // Reduce el coste de reflow/paint cuando el plugin desmonta o
      // monta muchos `<li>` de golpe (colapsar/expandir un padre con
      // miles de hijos). El navegador solo pinta lo visible en viewport.
      contentVisibility: 'auto' as const,
      // Hint de altura para que el navegador estime el espacio sin
      // medir cada li individualmente.
      containIntrinsicSize: '0 22px',
    },
    '& li > a, & li > input, & li > span': {
      display: 'inline-block',
      verticalAlign: 'middle',
    },
    '& li > span': { whiteSpace: 'nowrap' as const },
    '& a': { cursor: 'pointer', userSelect: 'none', color: 'text.primary' },
    '& a.plus, & a.minus': {
      width: 12,
      textAlign: 'center' as const,
      marginRight: '4px',
      fontWeight: 700,
      color: 'text.secondary',
    },
    '& input[type="checkbox"]': { marginRight: '4px' },
    '& li.highlighted-node > span, & li.highlighted-node > a': {
      color: 'primary.contrastText !important',
      fontWeight: '700 !important',
    },
    '& li.highlighted-node': {
      bgcolor: 'primary.main !important',
      borderRadius: 0.5,
    },
    '& li.xrayed-node > span': {
      color: 'text.disabled',
      fontStyle: 'italic',
    },
  }), []);

  return (
    <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 11, width: open ? 340 : 'auto' }}>
      <Paper elevation={3} sx={{ p: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <AccountTreeIcon fontSize="small" color="action" />
          {open && (
            <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>
              {t('tree.title')}
            </Typography>
          )}
          {open && (
            <>
              <Tooltip title={t('tree.expandAll')}>
                <IconButton size="small" onClick={expandAll}><UnfoldMoreIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title={t('tree.collapseAll')}>
                <IconButton size="small" onClick={collapseAll}><UnfoldLessIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title={t('tree.showAll')}>
                <IconButton size="small" onClick={showAll}><VisibilityIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title={t('tree.hideAll')}>
                <IconButton size="small" onClick={hideAll}><VisibilityOffIcon fontSize="small" /></IconButton>
              </Tooltip>
            </>
          )}
          <IconButton size="small" onClick={() => setOpen((v) => !v)}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Stack>

        {open && (
          <>
            <ToggleButtonGroup
              value={hierarchy}
              exclusive
              size="small"
              onChange={handleHierarchyChange}
              fullWidth
              sx={{ mt: 1, '& .MuiToggleButton-root': { py: 0.25, fontSize: 11, textTransform: 'none' } }}
            >
              {(Object.keys(HIERARCHY_KEYS) as Hierarchy[]).map((h) => (
                <ToggleButton key={h} value={h}>{t(HIERARCHY_KEYS[h])}</ToggleButton>
              ))}
            </ToggleButtonGroup>

            <TextField
              size="small"
              fullWidth
              placeholder={t('tree.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ mt: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
                sx: { fontSize: 12 },
              }}
            />

            {/* Lista de resultados visible solo cuando hay query. */}
            {searchQuery.trim() && (
              <>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {t('tree.results', { count: searchResults.length })}
                    {searchResults.length === 500 ? t('tree.resultsLimited') : ''}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setResultsVisible(false)}
                    disabled={searchResults.length === 0}
                    sx={{ fontSize: 10, textTransform: 'none' }}
                  >
                    {t('tree.hideAllResults')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setResultsVisible(true)}
                    disabled={searchResults.length === 0}
                    sx={{ fontSize: 10, textTransform: 'none' }}
                  >
                    {t('tree.showAllResults')}
                  </Button>
                </Stack>
                <Box
                  sx={{
                    mt: 1,
                    maxHeight: 'calc(100vh - 320px)',
                    overflowY: 'auto',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'background.default',
                  }}
                >
                  <List dense disablePadding>
                    {searchResults.map((r) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const v = (window as any)[viewerWindowKey];
                      const visible = v?.scene?.objects?.[r.id]?.visible !== false;
                      return (
                        <ListItem key={r.id} disablePadding secondaryAction={
                          <Checkbox
                            size="small"
                            edge="end"
                            checked={visible}
                            onChange={(_, checked) => toggleResultVisible(r.id, checked)}
                          />
                        }>
                          <ListItemButton onClick={() => flyToResult(r.id)} sx={{ py: 0.25 }}>
                            <ListItemText
                              primary={r.name}
                              secondary={r.type}
                              primaryTypographyProps={{ fontSize: 12, noWrap: true }}
                              secondaryTypographyProps={{ fontSize: 10, noWrap: true }}
                            />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              </>
            )}

            {/* El contenedor del árbol SIEMPRE va montado para que el
                TreeViewPlugin no pierda su DOM cuando se busca. Se oculta
                con CSS — `searchQuery` no afecta a la vida del div. */}
            <Box sx={{ ...treeCardSx, display: searchQuery.trim() ? 'none' : undefined }}>
              {!ready && (
                <Typography variant="caption" color="text.secondary">
                  {t('tree.loadingModel')}
                </Typography>
              )}
              <div ref={containerRef} />
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
}

export default ModelTreePanel;
