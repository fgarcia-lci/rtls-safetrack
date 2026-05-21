// MainLayout simplificado para RTLS Safetrack.
//
// Patrón visual del DT (AppBar + drawer + content area) pero sin las
// dependencias específicas del DT (visor xeokit, NotificationCenter,
// AlertBanner, useDeviceData, etc.). Esos se enchufan en fases siguientes
// conforme se implementen las features.

import React, { useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Visibility as LiveIcon,
  Person as WorkersIcon,
  Business as CompaniesIcon,
  Sensors as TagsIcon,
  Warning as ZonesIcon,
  History as EventsIcon,
  Notifications as NotificationsIcon,
  Sos as SosIcon,
  Layers as PlantViewsIcon,
} from '@mui/icons-material';
import { Badge, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { PlantSelector } from '../PlantSelector/PlantSelector';
import { LanguageSelector } from '../LanguageSelector/LanguageSelector';
import { UserMenu } from '../UserMenu/UserMenu';
import { AlertsDrawer } from '../AlertsDrawer/AlertsDrawer';
import { GlobalSearch } from '../GlobalSearch/GlobalSearch';
import { useAlertsStream } from '../../hooks/useAlertsStream';
import { config } from '../../config/config';
import { Live } from '../../pages/Live/Live';
import { browserNotifications, type NavigateToAlertDetail } from '../../services/browserNotifications';
import { unlockAudioContext } from '../../services/sirenAudio';
import { AlertBanner } from '../AlertBanner/AlertBanner';
import { CriticalSiren } from '../CriticalSiren/CriticalSiren';
import { SessionWarningDialog } from '../SessionWarningDialog/SessionWarningDialog';
import { SosSiren } from '../SosSiren/SosSiren';
import { SosDrawer } from '../SosDrawer/SosDrawer';
import { useSosStream } from '../../hooks/useSosStream';

const DRAWER_WIDTH = 240;

interface NavItem {
  path: string;
  labelKey: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: '/', labelKey: 'navigation.dashboard', icon: <DashboardIcon /> },
  { path: '/live', labelKey: 'navigation.live', icon: <LiveIcon /> },
  { path: '/workers', labelKey: 'navigation.workers', icon: <WorkersIcon /> },
  { path: '/companies', labelKey: 'navigation.companies', icon: <CompaniesIcon /> },
  { path: '/tags', labelKey: 'navigation.tags', icon: <TagsIcon /> },
  { path: '/zones', labelKey: 'navigation.zones', icon: <ZonesIcon /> },
  { path: '/events', labelKey: 'navigation.events', icon: <EventsIcon /> },
  { path: '/admin/plant-views', labelKey: 'navigation.plantViews', icon: <PlantViewsIcon /> },
];

export const MainLayout: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  // Cerrar drawers cuando el usuario cambia de página: evita que un panel
  // queden abiertos sobre una vista a la que ya no aplican (ej. AlertsDrawer
  // todavía pintado encima de /workers/:id tras navegar).
  useEffect(() => {
    setAlertsOpen(false);
    setSosOpen(false);
  }, [location.pathname]);
  // Stream SOS para badge en el AppBar — muestra cuántos SOS activos hay.
  const { count: sosCount } = useSosStream(config.plant.defaultId);

  // Keep-alive de la vista Live: el visor xeokit es caro de inicializar
  // (descarga del .xkt + parseo + upload a GPU). En lugar de montar/
  // desmontar Live al navegar, lo renderizamos siempre dentro del Layout
  // tras la primera visita y lo escondemos con display:none cuando la URL
  // no es /live. Así el modelo y la escena permanecen vivos en GPU y al
  // volver a /live es instantáneo. Coste: ~200-400 MB de RAM/VRAM
  // permanentes mientras la app esté abierta. WS de posiciones queda
  // activo en background — deseable para no perder eventos.
  const isLive = location.pathname === '/live';
  // Routes that mount their own heavy xeokit viewer. While inside them we
  // unmount Live entirely — sharing the GPU between two xeokit viewers
  // causes WebGL buffer corruption (`Insufficient buffer size` in a loop
  // and the editor scene never paints after SPA navigation). Hard reload
  // worked because Live wasn't mounted yet.
  const isHeavy3DRoute = location.pathname.startsWith('/zones/editor');
  const liveVisitedRef = useRef(false);
  if (isLive) liveVisitedRef.current = true;

  // Notificaciones nativas del navegador:
  //   1. Pedir permiso una vez al cargar el layout (después del login).
  //      El navegador solo muestra el popup si el permiso aún no está
  //      decidido; si ya está granted/denied es no-op.
  //   2. Escuchar el evento `rtls:navigate-to-alert` que dispara
  //      browserNotifications.showAlert() cuando el usuario hace click
  //      en una notificación del SO. Navegamos SPA (sin reload) para
  //      preservar el keep-alive del visor xeokit.
  useEffect(() => {
    browserNotifications.requestPermission();
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<NavigateToAlertDetail>).detail;
      if (detail?.tagSerial) {
        navigate(`/live?focusTag=${detail.tagSerial}&follow=true`);
      } else if (detail?.workerId) {
        navigate(`/live?focusWorker=${detail.workerId}&follow=true`);
      }
    };
    window.addEventListener(browserNotifications.NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(browserNotifications.NAVIGATE_EVENT, handler);
  }, [navigate]);

  // Desbloquea el AudioContext de la sirena al primer gesto del usuario.
  // Sin esto, la política de autoplay del navegador silencia el sonido
  // de CriticalSiren si la primera alerta llega antes de que el user
  // haya hecho click en cualquier sitio.
  useEffect(() => {
    const handler = () => { void unlockAudioContext(); };
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);
  // Plant fija en PoC. En el futuro vendrá del PlantSelector global.
  const { open: openAlerts, history: historyAlerts, unread: unreadAlerts, connected: alertsConnected, ack: ackAlert } =
    useAlertsStream(config.plant.defaultId);

  const drawerContent = (
    <Box sx={{ width: DRAWER_WIDTH, pt: isMobile ? 0 : 8 }}>
      <List>
        {navItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                if (isMobile) setDrawerOpen(false);
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={t(item.labelKey)} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          borderRadius: 0,
        }}
      >
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            disableRipple
            onClick={() => setDrawerOpen((v) => !v)}
            sx={{ mr: 2, '&:focus': { outline: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" component="div" sx={{ mr: 2, whiteSpace: 'nowrap' }}>
            {t('common.appName')}
          </Typography>

          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <PlantSelector compact={isMobile} />
            {!isMobile && <GlobalSearch />}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LanguageSelector />
            {/* SOS — icono rojo pulsante si hay activos. Click → drawer
                con la lista de SOS abiertos para gestionar. */}
            <Tooltip title={sosCount > 0 ? `${sosCount} SOS activo(s)` : 'No hay SOS activos'}>
              <IconButton
                size={isMobile ? 'small' : 'large'}
                disableRipple
                onClick={() => setSosOpen(true)}
                sx={{
                  '&:focus': { outline: 'none' },
                  color: sosCount > 0 ? '#fff' : 'inherit',
                  bgcolor: sosCount > 0 ? 'error.main' : 'transparent',
                  borderRadius: 1,
                  animation: sosCount > 0 ? 'rtls-sos-icon-pulse 0.8s ease-in-out infinite' : 'none',
                  '@keyframes rtls-sos-icon-pulse': {
                    '0%, 100%': { backgroundColor: '#c62828' },
                    '50%':      { backgroundColor: '#ff1744' },
                  },
                  ml: 0.5,
                  mr: 0.5,
                  px: 1,
                }}
              >
                <Badge badgeContent={sosCount} color="warning" invisible={sosCount === 0}>
                  <SosIcon fontSize={isMobile ? 'small' : 'medium'} />
                </Badge>
              </IconButton>
            </Tooltip>
            {/* Bell + badge — abre AlertsDrawer. Mismo patrón que el
                NotificationCenter del DT para que la integración futura
                sea drop-in. */}
            <Tooltip title={t('notifications.title') ?? 'Alertas'}>
              <IconButton
                size={isMobile ? 'small' : 'large'}
                color="inherit"
                disableRipple
                onClick={() => setAlertsOpen(true)}
                sx={{ '&:focus': { outline: 'none' } }}
              >
                <Badge badgeContent={unreadAlerts} color="error">
                  <NotificationsIcon fontSize={isMobile ? 'small' : 'medium'} />
                </Badge>
              </IconButton>
            </Tooltip>
            <UserMenu />
          </Box>
        </Toolbar>
      </AppBar>

      <AlertsDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        openEvents={openAlerts}
        history={historyAlerts}
        connected={alertsConnected}
        onAck={ackAlert}
      />

      {/* Toasts flotantes top-right para alertas nuevas (estilo DT). */}
      <AlertBanner plantId={config.plant.defaultId} onAck={ackAlert} />

      {/* Overlay full-screen + sirena para CRÍTICAS sin ACK. Cubre toda
          la app y obliga a confirmar — el vigilante no puede ignorarla. */}
      <CriticalSiren plantId={config.plant.defaultId} onAck={ackAlert} />

      {/* Aviso modal cuando el refresh del token falla y la sesión va a
          caducar. Permite reintentar o cerrar sesión. */}
      <SessionWarningDialog />

      {/* SOS / pánico — variante más agresiva. Se monta a nivel global
          para que el vigilante lo vea esté donde esté en la app. */}
      <SosSiren plantId={config.plant.defaultId} />

      {/* Drawer con lista de SOS activos — abierto desde el icono 🆘
          del AppBar. Permite gestionar múltiples SOS en paralelo. */}
      <SosDrawer
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        plantId={config.plant.defaultId}
      />

      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          width: drawerOpen && !isMobile ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: 8,
          ml: drawerOpen && !isMobile ? `${DRAWER_WIDTH}px` : 0,
          transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          overflow: 'auto',
          height: 'calc(100vh - 64px)',
          position: 'relative',
        }}
      >
        {/* Live persistente — montado tras la primera visita y oculto
            cuando la URL no es /live. Ver nota arriba.
            Excepción: en rutas con su propio viewer xeokit pesado
            (editor de zonas) lo desmontamos para evitar conflicto WebGL. */}
        {liveVisitedRef.current && !isHeavy3DRoute && (
          <Box
            sx={{
              display: isLive ? 'block' : 'none',
              height: '100%',
              width: '100%',
            }}
          >
            <Live />
          </Box>
        )}
        {/* Resto de rutas — el Outlet se oculta cuando estamos en /live
            (la propia ruta /live tiene element=null para no duplicar el
            componente Live, que ya vive arriba). */}
        <Box
          sx={{
            display: isLive ? 'none' : 'block',
            height: '100%',
            width: '100%',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;
