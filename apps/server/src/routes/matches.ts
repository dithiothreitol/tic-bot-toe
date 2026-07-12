import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { matches } from '../db/schema';

/** GET /api/matches/recent — last 20 matches (SPEC §14). */
export function matchesRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/recent', async (c) => {
    const rows = await deps.db
      .select({
        id: matches.id,
        game: matches.game,
        variant: matches.variant,
        mode: matches.mode,
        p1Id: matches.p1Id,
        p2Id: matches.p2Id,
        winner: matches.winner,
        createdAt: matches.createdAt,
      })
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(20);
    return c.json(rows);
  });
  return app;
}

/** GET /api/replay/:id — full match data, public, no JWT (SPEC §11/§14). */
export function replayRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/:id', async (c) => {
    const id = c.req.param('id');
    const rows = await deps.db.select().from(matches).where(eq(matches.id, id)).limit(1);
    if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json(rows[0]);
  });
  return app;
}
