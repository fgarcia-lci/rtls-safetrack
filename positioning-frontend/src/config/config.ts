// Configuración del frontend de RTLS Safetrack.
// Sigue el patrón del DT pero solo con lo que necesitamos para la PoC.

export interface AppConfig {
  i18n: {
    defaultLanguage: string;
    autoDetectBrowser: boolean;
    persistLanguage: boolean;
  };
  brand: {
    name: string;
    logoUrl: string;
  };
  api: {
    baseUrl: string;
    authUrl: string;
    timeout: number;
  };
  model: {
    id: string;
    src: string;
    edges: boolean;
    format: 'xkt' | 'ifc';
  };
  plant: {
    defaultId: string;
  };
}

export const config: AppConfig = {
  i18n: {
    defaultLanguage: 'es',
    autoDetectBrowser: true,
    persistLanguage: true,
  },

  brand: {
    name: 'RTLS Safetrack',
    logoUrl: import.meta.env.VITE_LOGO_URL ?? 'https://www.lc-i.es/images/logo_lci.png',
  },

  // baseUrl relativo (`/api`) sirve tanto en dev (vite proxy → :8090) como en
  // producción/docker (nginx proxy → positioning-api:8090). El auth-server
  // del DT siempre va por URL absoluta porque está en otro origen y el
  // navegador hace el redirect OAuth2 directamente.
  api: {
    baseUrl: import.meta.env.VITE_API_URL ?? '/api',
    authUrl: import.meta.env.VITE_AUTH_URL ?? 'http://localhost:9000',
    timeout: 30000,
  },

  // Modelo XKT por defecto (configurable por planta vía pos_plant_views)
  model: {
    id: 'tsp3PlantModel',
    src: '/models/prueba_paco3.xkt',
    edges: true,
    format: 'xkt',
  },

  // Planta piloto en PoC
  plant: {
    defaultId: 'TSP3',
  },
};
