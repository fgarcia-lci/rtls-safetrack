import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme/theme';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute/ProtectedRoute';
import { MainLayout } from './components/Layout/MainLayout';
import { Login } from './pages/Login/Login';
import { Callback } from './pages/Callback/Callback';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Live } from './pages/Live/Live';
import { Workers } from './pages/Workers/Workers';
import { Tags } from './pages/Tags/Tags';
import { Zones } from './pages/Zones/Zones';
import { ZoneEditorPage } from './pages/Zones/ZoneEditorPage';
import { Events } from './pages/Events/Events';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/callback" element={<Callback />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="live" element={<Live />} />
              <Route path="workers" element={<Workers />} />
              <Route path="tags" element={<Tags />} />
              <Route path="zones" element={<Zones />} />
              <Route path="zones/editor" element={<ZoneEditorPage />} />
              <Route path="zones/editor/:id" element={<ZoneEditorPage />} />
              <Route path="events" element={<Events />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
