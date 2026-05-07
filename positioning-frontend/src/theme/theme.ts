// Material-UI theme — clonado literal del Digital Twin
// (`digital-twin-frontend/src/theme/theme.ts`) para mantener look & feel
// idéntico entre los dos productos.

import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0077cc',
      dark: '#114A84',
      light: '#3399dd',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ff6b35',
      dark: '#cc5529',
      light: '#ff8a5c',
      contrastText: '#ffffff',
    },
    error: { main: '#F44336' },
    warning: { main: '#FF9800' },
    info: { main: '#2196F3' },
    success: { main: '#4CAF50' },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: { fontSize: '2.5rem', fontWeight: 500 },
    h2: { fontSize: '2rem', fontWeight: 500 },
    h3: { fontSize: '1.75rem', fontWeight: 500 },
    h4: { fontSize: '1.5rem', fontWeight: 500 },
    h5: { fontSize: '1.25rem', fontWeight: 500 },
    h6: { fontSize: '1rem', fontWeight: 500 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 8 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
      },
    },
  },
});

export default theme;
