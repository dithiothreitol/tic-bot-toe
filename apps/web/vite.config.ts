import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Dev: forward API calls to the Hono backend so the SPA stays same-origin
    // (matches the single-port production deploy — no CORS anywhere).
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
