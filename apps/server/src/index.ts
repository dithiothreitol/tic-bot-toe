import { readFile } from 'node:fs/promises';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { buildApp } from './app';
import { loadConfig } from './config';
import { type DbHandle, createDb } from './db/client';
import { matches } from './db/schema';
import { injectOgMeta, matchOgTags, matchStructuredData } from './og/meta';
import {
  STATIC_SITEMAP_URLS,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemap,
  originFrom,
} from './og/seo';

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

const originOf = (c: { req: { header: (k: string) => string | undefined } }): string =>
  originFrom(c.req.header('host'), c.req.header('x-forwarded-proto'), config.trustedProxy);

let indexHtmlCache: string | null = null;
async function indexHtml(): Promise<string> {
  if (indexHtmlCache === null) {
    indexHtmlCache = await readFile(`${config.staticDir}/index.html`, 'utf8');
  }
  return indexHtmlCache;
}

/** The SPA shell with `%VITE_SITE_URL%` resolved to the request's absolute origin. */
async function renderShell(origin: string): Promise<string> {
  return (await indexHtml()).replaceAll('%VITE_SITE_URL%', origin);
}

// ---- SEO (complete, agent-friendly): robots, sitemap, llms.txt ----
app.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.body(buildRobotsTxt(originOf(c)));
});

app.get('/llms.txt', (c) => {
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.body(buildLlmsTxt(originOf(c)));
});

app.get('/sitemap.xml', async (c) => {
  const origin = originOf(c);
  const urls = [...STATIC_SITEMAP_URLS];
  if (dbHandle) {
    const recent = await dbHandle.db
      .select({ id: matches.id, createdAt: matches.createdAt })
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(1000);
    for (const r of recent) {
      urls.push({
        path: `/replay/${r.id}`,
        changefreq: 'monthly',
        priority: 0.5,
        lastmod: r.createdAt.toISOString().slice(0, 10),
      });
    }
  }
  c.header('Content-Type', 'application/xml; charset=utf-8');
  return c.body(buildSitemap(origin, urls));
});

// ---- Replay permalink: serve the SPA shell with per-match OG meta + JSON-LD ----
if (dbHandle) {
  const handle = dbHandle;
  app.get('/replay/:id', async (c) => {
    const origin = originOf(c);
    const html = await renderShell(origin);
    const id = c.req.param('id');
    const rows = await handle.db
      .select({
        game: matches.game,
        variant: matches.variant,
        p1Id: matches.p1Id,
        p2Id: matches.p2Id,
        winner: matches.winner,
      })
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1);
    if (rows.length === 0) return c.html(html); // SPA renders its own 404
    const tags = matchOgTags({ id, ...rows[0] }, origin);
    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.html(injectOgMeta(html, tags, matchStructuredData({ id, ...rows[0] }, tags)));
  });
}

// Serve the built frontend on the same port (SPEC §3). The root and every SPA
// route return the shell with the request origin templated into the default SEO
// tags; real static files (assets, og.png, favicon) are served verbatim.
const shellHandler = async (c: Context): Promise<Response> => {
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.html(await renderShell(originOf(c)));
};
app.get('/', shellHandler);
app.use('/*', serveStatic({ root: config.staticDir }));
app.get('*', shellHandler);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
