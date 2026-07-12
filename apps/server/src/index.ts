import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = buildApp({ config });

// Serve the built frontend on the same port (SPEC §3). API is mounted at /api
// and takes precedence; unknown paths fall back to index.html (SPA routing).
app.use('/*', serveStatic({ root: config.staticDir }));
app.get('*', serveStatic({ path: `${config.staticDir}/index.html` }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
  console.log(`[server] serving static from ${config.staticDir}`);
  if (config.enableOllama) console.log('[server] Ollama proxy ENABLED');
});
