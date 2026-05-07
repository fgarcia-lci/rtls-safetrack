/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // xeokit-sdk usa `pako` para descomprimir XKT. Vite la tree-shakea si no la
  // incluimos explícitamente, dando "Cannot read properties of undefined
  // (reading 'inflate')" en runtime al cargar el modelo en build.
  optimizeDeps: {
    include: ['pako', '@xeokit/xeokit-sdk'],
  },
  server: {
    port: 5180,
    strictPort: true,
    // En dev (npm run dev), proxy /api/* → http://localhost:8090/api/*.
    // En docker, este proxy no aplica — nginx hace el routing equivalente.
    // El target apunta al api del docker-compose (puerto host 8090).
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        ws: true,   // soporte WebSocket para STOMP/SockJS
      },
    },
  },
  define: {
    global: 'globalThis',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
