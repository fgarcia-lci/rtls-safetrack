import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config' // Initialize i18n
import App from './App.tsx'

// pako (zlib en JS) lo carga el index.html desde CDN ANTES del bundle
// para que xeokit-sdk (que lo busca como global) lo encuentre.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
