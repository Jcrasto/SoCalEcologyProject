import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8008',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Proxy GBIF map tiles through Vite to avoid browser blocking of
      // direct requests to api.gbif.org from localhost.
      '/gbif-tiles': {
        target: 'https://api.gbif.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gbif-tiles/, '/v2/map'),
      },
    }
  }
})
