import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // forward UI /api/* → Worker dev server
      '/api': {
        target: 'http://localhost:8787', // ← use the URL Wrangler shows
        changeOrigin: true,
        secure: false,
      },
    },
  },
})