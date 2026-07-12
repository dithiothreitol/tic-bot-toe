import { and, eq, or } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { matches, ratings } from '../db/schema';
import { project } from './leaderboard';

/**
 * GET /api/model/:id — model card data (SPEC §12.3/§14): the subject's rating
 * row for one mode·game·variant plus its head-to-head record against every
 * opponent it has faced. Public read, no JWT — same posture as the leaderboard.
 *
 * The `:id{.+}` wildcard is deliberate: subject ids carry slashes
 * (`openrouter:meta-llama/llama-3`), so a single path segment would truncate
 * them. The Elo curve is served by the dedicated /api/elo-history endpoint.
 */
export function modelRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/:id{.+}', async (c) => {
    const subjectId = c.req.param('id');
    const mode = c.req.query('mode') ?? 'model_vs_model';
    const game = c.req.query('game') ?? 'tictactoe';
    const variant = c.req.query('variant') ?? 'standard';

    const ratingRows = await deps.db
      .select()
      .from(ratings)
      .where(
        and(
          eq(ratings.subjectId, subjectId),
          eq(ratings.mode, mode),
          eq(ratings.game, game),
          eq(ratings.variant, variant),
        ),
      )
      .limit(1);

    // Same projection as the leaderboard — one place decides what Precyzja means.
    const r = ratingRows[0];
    const card = r ? project(r) : null;

    // Head-to-head: every non-lab match this subject played, tallied by opponent.
    const played = await deps.db
      .select({ p1Id: matches.p1Id, p2Id: matches.p2Id, winner: matches.winner })
      .from(matches)
      .where(
        and(
          eq(matches.mode, mode),
          eq(matches.game, game),
          eq(matches.variant, variant),
          eq(matches.lab, false),
          or(eq(matches.p1Id, subjectId), eq(matches.p2Id, subjectId)),
        ),
      );

    const tally = new Map<string, { games: number; wins: number; losses: number; draws: number }>();
    for (const m of played) {
      const oppId = m.p1Id === subjectId ? m.p2Id : m.p1Id;
      const t = tally.get(oppId) ?? { games: 0, wins: 0, losses: 0, draws: 0 };
      t.games += 1;
      if (m.winner === 'draw' || m.winner === null) t.draws += 1;
      else {
        const winnerId = m.winner === 'p1' ? m.p1Id : m.p2Id;
        if (winnerId === subjectId) t.wins += 1;
        else t.losses += 1;
      }
      tally.set(oppId, t);
    }
    const opponents = [...tally.entries()]
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => b.games - a.games);

    return c.json({ subjectId, card, opponents });
  });
  return app;
}
