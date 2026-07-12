import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { ratings } from '../db/schema';

/**
 * GET /api/leaderboard?mode=&game=&variant= — ranking with telemetry (SPEC §10).
 * In-memory cache 60s. Latency is the mean from the running sums (median from
 * `matches` is a Stage 9+ refinement).
 */
interface CacheEntry {
  at: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export function resetLeaderboardCache(): void {
  cache.clear();
}

export function leaderboardRoute(deps: { db: Database; now?: () => number }): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    const mode = c.req.query('mode') ?? 'model_vs_model';
    const game = c.req.query('game') ?? 'tictactoe';
    const variant = c.req.query('variant') ?? 'standard';
    const key = `${mode}:${game}:${variant}`;
    const now = (deps.now ?? Date.now)();

    const cached = cache.get(key);
    if (cached && now - cached.at < TTL_MS) return c.json(cached.data);

    const rows = await deps.db
      .select()
      .from(ratings)
      .where(and(eq(ratings.mode, mode), eq(ratings.game, game), eq(ratings.variant, variant)))
      .orderBy(desc(ratings.elo));

    const data = rows.map((r) => ({
      subjectId: r.subjectId,
      elo: r.elo,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      games: r.games,
      forfeitRate: r.totalMoves > 0 ? r.forfeitMoves / r.totalMoves : 0,
      avgLatencyMs: r.totalMoves > 0 ? r.latencyMsSum / r.totalMoves : null,
      avgTokensPerMove: r.totalMoves > 0 ? Number(r.tokensSum) / r.totalMoves : null,
      avgCostPerGame: r.games > 0 ? Number(r.costUsdSum) / r.games : null,
      optimalRate: r.totalMoves > 0 ? r.optimalMoves / r.totalMoves : null,
    }));

    cache.set(key, { at: now, data });
    return c.json(data);
  });
  return app;
}
