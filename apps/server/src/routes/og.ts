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

    const png = renderMatchOg(rows[0] as OgMatch);
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  });
  return app;
}
