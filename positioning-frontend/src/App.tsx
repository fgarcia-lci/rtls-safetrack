import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme/theme';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute/ProtectedRoute';
import { MainLayout } from './components/Layout/MainLayout';
import { Login } from './pages/Login/Login';
import { Callback } from './pages/Callback/Callback';
import { Dashboard } from './pages/Dashboard/Dashboard';
// Live NO se importa aquí: vive persistente dentro de MainLayout (keep-alive
// para no recargar el modelo xeokit en cada navegación). La ruta /live
// existe en el Routes con element={null} para que el path sea válido.
import { Workers } from './pages/Workers/Workers';
import { WorkerDetail } from './pages/Workers/WorkerDetail';
import { Companies } from './pages/Companies/Companies';
import { CompanyDetail } from './pages/Companies/CompanyDetail';
import { Tags } from './pages/Tags/Tags';
import { TagDetail } from './pages/Tags/TagDetail';
import { Zones } from './pages/Zones/Zones';
import { ZoneEditorPage } from './pages/Zones/ZoneEditorPage';
import { Events } from './pages/Events/Events';
import { PlantViews } from './pages/Admin/PlantViews';

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
              <Route path="live" element={null} />
              <Route path="workers" element={<Workers />} />
              <Route path="workers/:id" element={<WorkerDetail />} />
              <Route path="companies" element={<Companies />} />
              <Route path="companies/:id" element={<CompanyDetail />} />
              <Route path="tags" element={<Tags />} />
              <Route path="tags/:id" element={<TagDetail />} />
              <Route path="zones" element={<Zones />} />
              <Route path="zones/editor" element={<ZoneEditorPage />} />
              <Route path="zones/editor/:id" element={<ZoneEditorPage />} />
              <Route path="events" element={<Events />} />
              <Route path="admin/plant-views" element={<PlantViews />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
