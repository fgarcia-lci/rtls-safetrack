// Cliente axios compartido para todas las llamadas al positioning-api.
// Patrón sencillo: interceptor que inyecta el JWT y maneja 401.

import axios, { type AxiosInstance } from 'axios';
import { config } from '../config/config';

const ACCESS_TOKEN_KEY = 'safetrack_access_token';

export const api: AxiosInstance = axios.create({
  baseURL: config.api.baseUrl,
  timeout: config.api.timeout,
});

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Si el token caducó y el AuthContext no lo refrescó a tiempo, redirigimos a login.
    if (error?.response?.status === 401) {
      console.warn('[api] 401 received; clearing auth and redirecting to /login');
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem('safetrack_refresh_token');
      localStorage.removeItem('safetrack_user_info');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/callback') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
