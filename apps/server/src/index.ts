import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { buildApp } from './app';
import { loadConfig } from './config';
import { type DbHandle, createDb } from './db/client';

const config = loadConfig();

let dbHandle: DbHandle | undefined;
if (config.databaseUrl) {
  dbHandle = createDb(config.databaseUrl);
  await dbHandle.migrate('./drizzle');
  console.log('[server] migrations applied');
} else {
  console.warn('[server] DATABASE_URL not set — ranking endpoints disabled');
}

const app = buildApp({ config, db: dbHandle?.db });

// Serve the built frontend on the same port (SPEC §3). API (/api) takes
// precedence; unknown paths fall back to index.html (SPA routing).
app.use('/*', serveStatic({ root: config.staticDir }));
app.get('*', serveStatic({ path: `${config.staticDir}/index.html` }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
