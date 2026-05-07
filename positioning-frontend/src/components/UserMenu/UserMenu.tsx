// Clonado del Digital Twin (`digital-twin-frontend/src/components/UserMenu/UserMenu.tsx`)
// con simplificación: no usamos `user.fullName`/`user.company` (no los tenemos en
// Safetrack — el AuthContext solo extrae info del JWT, sin profile fetch).

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import { AccountCircle, Logout as LogoutIcon } from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

export const UserMenu: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
  };

  return (
    <>
      <Tooltip title={user?.email || ''}>
        <IconButton
          size="large"
          edge="end"
          color="inherit"
          disableRipple
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ '&:focus': { outline: 'none' } }}
        >
          <AccountCircle />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {user?.name || user?.email || 'RTLS Safetrack User'}
          </Typography>
          {user?.email && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {user.email}
            </Typography>
          )}
          {user?.roles && user.roles.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
              {user.roles
                .filter((r) => r.startsWith('ROLE_'))
                .map((role) => (
                  <Typography
                    key={role}
                    variant="caption"
                    sx={{
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}
                  >
                    {role.replace('ROLE_', '')}
                  </Typography>
                ))}
            </Box>
          )}
        </Box>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('userMenu.logout')}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default UserMenu;
