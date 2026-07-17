import { readFile } from 'node:fs/promises';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';

import { registerLexicon } from '@arena/game-core';
import { localeFromPath, localePath } from '@arena/i18n';
import { loadLexiconNode } from '@arena/lexicons/node';

import { buildApp } from './app';
import { loadConfig } from './config';
import { type DbHandle, createDb } from './db/client';
import { matches } from './db/schema';
import {
  alternatesFor,
  injectSeo,
  matchOgTags,
  matchStructuredData,
  siteDescription,
  siteOgTags,
  siteStructuredData,
} from './og/meta';
import {
  STATIC_SITEMAP_URLS,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemap,
  originFrom,
  replaySitemapUrls,
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

// Word-game dictionaries: load + register both so scrabble replay can validate
// words (plan §8.2). Until they are ready, POST /api/result refuses scrabble
// with 503 (routes/result). Best-effort — a failure only disables scrabble
// saving, never the rest of the server. `LEXICON_DIR` overrides the path.
for (const lang of ['pl', 'en'] as const) {
  try {
    registerLexicon(lang, await loadLexiconNode(lang, config.lexiconDir));
    console.log(`[server] ${lang} lexicon loaded`);
  } catch (e) {
    console.warn(`[server] ${lang} lexicon unavailable — scrabble saving disabled:`, (e as Error).message);
  }
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

/**
 * The SPA shell for one URL: `%VITE_SITE_URL%` resolved to the request's origin,
 * and the head rewritten for the language of the path (`/en/...` → English).
 *
 * The static index.html carries the Polish tags; the server is what makes the
 * English URLs real to a crawler — `<html lang>`, title, description, canonical,
 * hreflang and the OG card all follow the path, not the browser.
 */
async function renderShell(origin: string, path: string): Promise<string> {
  const html = (await indexHtml()).replaceAll('%VITE_SITE_URL%', origin);
  const locale = localeFromPath(path);
  return injectSeo(html, {
    locale,
    tags: siteOgTags(origin, path, locale),
    description: siteDescription(locale),
    alternates: alternatesFor(path, origin),
    structuredData: siteStructuredData(origin, locale),
  });
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
      urls.push(...replaySitemapUrls(r.id, r.createdAt.toISOString().slice(0, 10)));
    }
  }
  c.header('Content-Type', 'application/xml; charset=utf-8');
  return c.body(buildSitemap(origin, urls));
});

// ---- Replay permalink: serve the SPA shell with per-match OG meta + JSON-LD ----
// One handler, both languages: the locale comes from the path, so `/replay/:id`
// previews in Polish and `/en/replay/:id` in English — including the OG image.
if (dbHandle) {
  const handle = dbHandle;
  const replayHandler = async (c: Context): Promise<Response> => {
    const origin = originOf(c);
    const path = new URL(c.req.url).pathname;
    const html = await renderShell(origin, path);
    // A shared handler is typed on plain `Context`, so the param is optional here.
    const id = c.req.param('id') ?? '';
    if (!id) return c.html(html);
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
    c.header('Content-Type', 'text/html; charset=utf-8');
    if (rows.length === 0) return c.html(html); // SPA renders its own 404
    const locale = localeFromPath(path);
    const match = { id, ...rows[0] };
    const tags = matchOgTags(match, origin, locale);
    return c.html(
      injectSeo(html, {
        locale,
        tags,
        alternates: alternatesFor(path, origin),
        structuredData: matchStructuredData(match, tags, locale),
        ogType: 'article',
      }),
    );
  };
  app.get(localePath('pl', 'replay', ':id'), replayHandler);
  app.get(localePath('en', 'replay', ':id'), replayHandler);
}

// Serve the built frontend on the same port (SPEC §3). The root and every SPA
// route return the shell with the request origin templated into the default SEO
// tags; real static files (assets, og.png, favicon) are served verbatim.
const shellHandler = async (c: Context): Promise<Response> => {
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.html(await renderShell(originOf(c), new URL(c.req.url).pathname));
};
app.get('/', shellHandler);
app.use('/*', serveStatic({ root: config.staticDir }));
app.get('*', shellHandler);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
