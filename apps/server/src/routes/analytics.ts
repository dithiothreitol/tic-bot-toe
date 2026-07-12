import { and, asc, eq, or } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { eloHistory, matches } from '../db/schema';

/**
 * Chart-data endpoints (SPEC §9.3). Public reads, no JWT — same posture as the
 * leaderboard: aggregated, non-personal telemetry.
 */

/**
 * GET /api/elo-history?subjectId=&mode=&game=&variant=
 * Ordered Elo checkpoints for one subject → LineChart "Przebieg Elo" (§9.3.4).
 */
export function eloHistoryRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    const subjectId = c.req.query('subjectId');
    if (!subjectId) return c.json({ error: 'subjectId required' }, 400);
    const mode = c.req.query('mode') ?? 'model_vs_model';
    const game = c.req.query('game') ?? 'tictactoe';
    const variant = c.req.query('variant') ?? 'standard';

    const rows = await deps.db
      .select({ eloAfter: eloHistory.eloAfter, createdAt: eloHistory.createdAt })
      .from(eloHistory)
      .where(
        and(
          eq(eloHistory.subjectId, subjectId),
          eq(eloHistory.mode, mode),
          eq(eloHistory.game, game),
          eq(eloHistory.variant, variant),
        ),
      )
      .orderBy(asc(eloHistory.id));

    return c.json(
      rows.map((r) => ({ eloAfter: r.eloAfter, at: r.createdAt.toISOString() })),
    );
  });
  return app;
}

/**
 * GET /api/head-to-head?a=&b=&mode=&game=&variant=
 * Win/loss/draw tally between two subjects from shared, non-lab matches, for the
 * CompareView table (§9.3.5). `wins`/`losses` are from A's perspective.
 */
export function headToHeadRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    const a = c.req.query('a');
    const b = c.req.query('b');
    if (!a || !b) return c.json({ error: 'a and b required' }, 400);
    const mode = c.req.query('mode') ?? 'model_vs_model';
    const game = c.req.query('game') ?? 'tictactoe';
    const variant = c.req.query('variant') ?? 'standard';

    const rows = await deps.db
      .select({ p1Id: matches.p1Id, p2Id: matches.p2Id, winner: matches.winner })
      .from(matches)
      .where(
        and(
          eq(matches.mode, mode),
          eq(matches.game, game),
          eq(matches.variant, variant),
          eq(matches.lab, false),
          or(
            and(eq(matches.p1Id, a), eq(matches.p2Id, b)),
            and(eq(matches.p1Id, b), eq(matches.p2Id, a)),
          ),
        ),
      );

    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    for (const r of rows) {
      if (r.winner === 'draw' || r.winner === null) {
        draws += 1;
        continue;
      }
      const winnerId = r.winner === 'p1' ? r.p1Id : r.p2Id;
      if (winnerId === a) aWins += 1;
      else if (winnerId === b) bWins += 1;
    }

    return c.json({ a, b, games: rows.length, aWins, bWins, draws });
  });
  return app;
}
