// Clonado literal del Digital Twin (`digital-twin-frontend/src/components/LanguageSelector/LanguageSelector.tsx`).

import React from 'react';
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import { Language as LanguageIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
];

export const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const currentLanguage = languages.find((lang) => lang.code === i18n.language) || languages[0];

  return (
    <>
      <Tooltip title={i18n.t('tooltips.changeLanguage')}>
        <IconButton
          size="large"
          color="inherit"
          disableRipple
          onClick={(e) => setAnchorEl(e.currentTarget)}
          aria-haspopup="true"
          sx={{ position: 'relative', '&:focus': { outline: 'none' } }}
        >
          <LanguageIcon sx={{ fontSize: '1.75rem' }} />
          <span
            style={{
              position: 'absolute',
              top: '0px',
              right: '2px',
              fontSize: '1.1rem',
              lineHeight: '1',
              filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))',
              pointerEvents: 'none',
            }}
          >
            {currentLanguage.flag}
          </span>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        {languages.map((lang) => (
          <MenuItem
            key={lang.code}
            selected={lang.code === i18n.language}
            onClick={() => {
              i18n.changeLanguage(lang.code);
              setAnchorEl(null);
            }}
          >
            <span style={{ fontSize: '1.5rem', marginRight: '10px' }}>{lang.flag}</span>
            {lang.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSelector;
