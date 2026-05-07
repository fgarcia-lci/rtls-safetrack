// i18n — clonado del Digital Twin (`digital-twin-frontend/src/i18n/config.ts`)
// con cambio de localStorage key (app_language → safetrack_language) para no
// chocar con el DT.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from './en.json';
import esTranslations from './es.json';

const STORAGE_KEY = 'safetrack_language';

const getBrowserLanguage = (): string => {
  const browserLang = navigator.language.split('-')[0];
  return ['en', 'es'].includes(browserLang) ? browserLang : 'es';
};

const getPersistedLanguage = (): string | null => {
  return localStorage.getItem(STORAGE_KEY);
};

const getInitialLanguage = (): string => {
  const persisted = getPersistedLanguage();
  if (persisted) return persisted;
  return getBrowserLanguage();
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslations },
    es: { translation: esTranslations },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
});

export default i18n;
