// AuthContext — clonado del Digital Twin (`digital-twin-frontend/src/context/AuthContext.tsx`)
// con dos simplificaciones:
//   1. NO llama `apiService.getMyProfile()` (Safetrack no tiene endpoint de perfil).
//      User info sale solo del JWT.
//   2. STORAGE_KEYS con prefijo `safetrack_` para no chocar con el DT si ambos
//      frontends están abiertos en el mismo navegador.

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  generatePKCE,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  performLogout,
  decodeJWT,
  isTokenExpired,
  type TokenResponse,
} from '../utils/oauth2';
import { safetrackWebSocket } from '../services/websocket';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  user: UserInfo | null;
  accessToken: string | null;
  login: () => void;
  logout: () => void;
  handleCallback: (code: string, state: string) => Promise<void>;
  /** Activo cuando el refresh automático ha fallado y la sesión va a caducar pronto. */
  showSessionWarning: boolean;
  /** Reintenta el refresh manualmente desde el dialog de aviso. */
  tryRefreshNow: () => Promise<boolean>;
  /** Cierra el dialog (el caller decide si hace logout u otra cosa). */
  dismissSessionWarning: () => void;
}

interface UserInfo {
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'safetrack_access_token',
  REFRESH_TOKEN: 'safetrack_refresh_token',
  CODE_VERIFIER: 'safetrack_code_verifier',
  STATE: 'safetrack_state',
  USER_INFO: 'safetrack_user_info',
  RETURN_TO: 'safetrack_return_to',
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showSessionWarning, setShowSessionWarning] = useState(false);

  // Load auth state from localStorage on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedAccessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      const storedUserInfo = localStorage.getItem(STORAGE_KEYS.USER_INFO);

      if (storedAccessToken && storedUserInfo) {
        if (isTokenExpired(storedAccessToken)) {
          if (storedRefreshToken) {
            try {
              const tokenResponse = await refreshAccessToken(storedRefreshToken);
              saveTokens(tokenResponse);
              const userInfo = extractUserInfo(tokenResponse.access_token);
              setUser(userInfo);
              setAccessToken(tokenResponse.access_token);
              setIsAuthenticated(true);
            } catch {
              clearAuth();
            }
          } else {
            clearAuth();
          }
        } else {
          setUser(JSON.parse(storedUserInfo));
          setAccessToken(storedAccessToken);
          setIsAuthenticated(true);
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  // Conecta el WebSocket STOMP en cuanto tenemos un token válido. Los
  // streams (alerts, sos, proximity, positions) llaman a subscribe()
  // desde sus respectivos setPlant, y si el cliente aún no estaba
  // activo, el subscribe queda en map sin emitirse al server. Activarlo
  // aquí garantiza que onConnect dispare y el map se procese.
  useEffect(() => {
    if (!accessToken || !isAuthenticated) return;
    safetrackWebSocket.connect();
  }, [accessToken, isAuthenticated]);

  // Refresh automático + popup pre-caducidad.
  //
  // Dos timers anclados al `exp` del access token actual:
  //   1) Refresh — dispara 2 min antes de caducar. Renueva access (+
  //      refresh por rotación → la sesión se extiende otros 7 días).
  //   2) Warning — dispara 1 min antes. Solo se muestra si el refresh
  //      anterior ha fallado y el access está a punto de caducar.
  //
  // Caso normal: refresh OK → setAccessToken → este useEffect se vuelve
  // a ejecutar con el nuevo token → timers reprogramados → warning
  // nunca se ve.
  // Caso fallo: refresh fail → showSessionWarning=true → modal pide
  // al usuario "Continuar" (reintentar) o "Cerrar sesión".
  useEffect(() => {
    if (!accessToken || !isAuthenticated) return;
    const payload = decodeJWT(accessToken);
    if (!payload || !payload.exp) return;
    const expMs = payload.exp * 1000;
    const refreshAt = expMs - Date.now() - 2 * 60 * 1000;
    const warningAt = expMs - Date.now() - 60 * 1000;

    let refreshFailed = false;

    const refreshTimer = refreshAt > 0 ? setTimeout(async () => {
      const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) { refreshFailed = true; return; }
      try {
        const tokenResponse = await refreshAccessToken(refreshToken);
        saveTokens(tokenResponse);
        const userInfo = extractUserInfo(tokenResponse.access_token);
        setUser(userInfo);
        setAccessToken(tokenResponse.access_token);
      } catch {
        refreshFailed = true;
      }
    }, refreshAt) : null;

    const warningTimer = warningAt > 0 ? setTimeout(() => {
      // Si el refresh falló (o nunca llegó a programarse), avisamos.
      if (refreshFailed) setShowSessionWarning(true);
    }, warningAt) : null;

    // Caducidad efectiva — si llegamos aquí sin refresh, redirigimos
    // con el flag para que la pantalla de login informe al usuario.
    const expiredTimer = setTimeout(() => {
      if (refreshFailed) {
        clearAuth();
        window.location.href = '/login?sessionExpired=1';
      }
    }, expMs - Date.now());

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (warningTimer) clearTimeout(warningTimer);
      clearTimeout(expiredTimer);
    };
  }, [accessToken, isAuthenticated]);

  // Reintento manual desde el dialog "su sesión va a caducar".
  const tryRefreshNow = async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) return false;
    try {
      const tokenResponse = await refreshAccessToken(refreshToken);
      saveTokens(tokenResponse);
      const userInfo = extractUserInfo(tokenResponse.access_token);
      setUser(userInfo);
      setAccessToken(tokenResponse.access_token);
      setShowSessionWarning(false);
      return true;
    } catch {
      return false;
    }
  };

  const login = async () => {
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();
      const state = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
      localStorage.setItem(STORAGE_KEYS.STATE, state);
      // RETURN_TO se guarda solo si la ruta actual no es la propia /login
      // o /callback. Comparamos `pathname` (sin query) porque /login viene
      // a menudo con `?sessionExpired=1` o `?logout=true` — incluir el
      // query string en la comparación dejaba pasar el filtro y guardaba
      // `/login?sessionExpired=1` como destino, devolviendo al usuario al
      // mismo login en bucle tras autenticarse.
      const currentPath = window.location.pathname;
      if (currentPath && currentPath !== '/login' && currentPath !== '/callback') {
        localStorage.setItem(STORAGE_KEYS.RETURN_TO, currentPath + window.location.search);
      }
      const authUrl = buildAuthorizationUrl(codeChallenge, state);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Login initiation failed:', error);
    }
  };

  const handleCallback = async (code: string, returnedState: string) => {
    try {
      const storedState = localStorage.getItem(STORAGE_KEYS.STATE);
      if (storedState !== returnedState) {
        throw new Error('State mismatch - possible CSRF attack');
      }
      const codeVerifier = localStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
      if (!codeVerifier) throw new Error('Code verifier not found');

      const tokenResponse = await exchangeCodeForTokens(code, codeVerifier);
      saveTokens(tokenResponse);
      const userInfo = extractUserInfo(tokenResponse.access_token);
      setUser(userInfo);
      setAccessToken(tokenResponse.access_token);
      setIsAuthenticated(true);

      localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
      localStorage.removeItem(STORAGE_KEYS.STATE);
    } catch (error) {
      console.error('Callback processing failed:', error);
      clearAuth();
      throw error;
    }
  };

  const logout = async () => {
    try {
      setIsLoggingOut(true);
      safetrackWebSocket.disconnect();
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (token) {
        try {
          await revokeToken(token);
        } catch (error) {
          console.warn('Token revocation failed:', error);
        }
      }
      clearAuth();
      await performLogout();
    } catch (error) {
      console.error('Logout failed:', error);
      clearAuth();
      await performLogout();
    }
  };

  const saveTokens = (tokenResponse: TokenResponse) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokenResponse.access_token);
    if (tokenResponse.refresh_token) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokenResponse.refresh_token);
    }
    const userInfo = extractUserInfo(tokenResponse.access_token);
    localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo));
  };

  const extractUserInfo = (token: string): UserInfo => {
    const payload = decodeJWT(token);
    let roles: string[] = [];
    if (Array.isArray(payload.authorities)) {
      roles = payload.authorities;
    } else if (typeof payload.authorities === 'string') {
      roles = payload.authorities.split(' ');
    }
    if (Array.isArray(payload.scope)) {
      roles = [...roles, ...payload.scope];
    } else if (typeof payload.scope === 'string') {
      roles = [...roles, ...payload.scope.split(' ')];
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      roles: [...new Set(roles)],
    };
  };

  const clearAuth = () => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    setUser(null);
    setAccessToken(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isLoggingOut,
        user,
        accessToken,
        login,
        logout,
        handleCallback,
        showSessionWarning,
        tryRefreshNow,
        dismissSessionWarning: () => setShowSessionWarning(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
