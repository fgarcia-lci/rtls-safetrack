// MainLayout simplificado para RTLS Safetrack.
//
// Patrón visual del DT (AppBar + drawer + content area) pero sin las
// dependencias específicas del DT (visor xeokit, NotificationCenter,
// AlertBanner, useDeviceData, etc.). Esos se enchufan en fases siguientes
// conforme se implementen las features.

import React, { useState } from 'react';
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
  Sensors as TagsIcon,
  Warning as ZonesIcon,
  History as EventsIcon,
  Notifications as NotificationsIcon,
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
  { path: '/tags', labelKey: 'navigation.tags', icon: <TagsIcon /> },
  { path: '/zones', labelKey: 'navigation.zones', icon: <ZonesIcon /> },
  { path: '/events', labelKey: 'navigation.events', icon: <EventsIcon /> },
];

export const MainLayout: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [alertsOpen, setAlertsOpen] = useState(false);
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
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;
