import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

/**
 * Serve the compiled dictionaries at `/lexicons/<lang>.dawg` — in dev straight
 * from `packages/lexicons/dist`, and at build emitted into the output — so the
 * word game can lazy-load them without duplicating the artifacts into `public/`.
 */
function lexiconAssets(): Plugin {
  const distDir = path.resolve(import.meta.dirname, '../../packages/lexicons/dist');
  const files = ['pl.dawg', 'en.dawg'];
  return {
    name: 'arena-lexicon-assets',
    configureServer(server) {
      server.middlewares.use('/lexicons', (req, res, next) => {
        const file = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!/^[a-z]+\.dawg$/.test(file)) return next();
        const p = path.join(distDir, file);
        if (!fs.existsSync(p)) return next();
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        fs.createReadStream(p).pipe(res);
      });
    },
    generateBundle() {
      for (const f of files) {
        const p = path.join(distDir, f);
        if (fs.existsSync(p)) {
          this.emitFile({ type: 'asset', fileName: `lexicons/${f}`, source: fs.readFileSync(p) });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), lexiconAssets()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Dev: forward API calls to the Hono backend so the SPA stays same-origin
    // (matches the single-port production deploy — no CORS anywhere).
    // 8090, bo 8080 jest zarezerwowany dla backendu grzybiarza (patrz PORT w .env).
    proxy: {
      '/api': 'http://localhost:8090',
    },
  },
});
