import { type Locale, isLocale } from '@arena/i18n';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { matches } from '../db/schema';
import { type OgMatch, renderMatchOg } from '../og/render';

/**
 * GET /api/og/:id — PNG preview of a match (SPEC §11, §20.7 renders < 1s).
 * Public, no JWT. Cached hard (a match is immutable once saved).
 */
export function ogRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const rows = await deps.db
      .select({
        game: matches.game,
        variant: matches.variant,
        p1Id: matches.p1Id,
        p2Id: matches.p2Id,
        winner: matches.winner,
        setup: matches.setup,
        moves: matches.moves,
      })
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1);
    if (rows.length === 0) return c.json({ error: 'not_found' }, 404);

    // The card carries words ("Battleship · draw"), so it follows the language of
    // the link that embeds it. Unknown/absent → Polish, the canonical language.
    const lang = c.req.query('lang');
    const locale: Locale = isLocale(lang) ? lang : 'pl';

    const png = renderMatchOg(rows[0] as OgMatch, locale);
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        // Immutable per (id, lang) — caches key on the query string, so the two
        // language cards never collide.
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  });
  return app;
}
