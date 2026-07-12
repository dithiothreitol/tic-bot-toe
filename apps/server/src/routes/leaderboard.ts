import { and, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { players, ratings } from '../db/schema';

/**
 * GET /api/leaderboard?mode=&game=&variant=&subject= — ranking with telemetry
 * (SPEC §10). `subject=models` (default) ranks non-human subjects; `subject=humans`
 * ranks identified people (join `players`), showing nicknames and only players
 * who set a nickname and are not flagged. In-memory cache 60s.
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

/** Shared telemetry projection. `label` is what the UI shows; `subjectId` stays the real key. */
function project(r: typeof ratings.$inferSelect, label?: string) {
  return {
    subjectId: r.subjectId,
    label,
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
  };
}

export function leaderboardRoute(deps: { db: Database; now?: () => number }): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    const mode = c.req.query('mode') ?? 'model_vs_model';
    const game = c.req.query('game') ?? 'tictactoe';
    const variant = c.req.query('variant') ?? 'standard';
    const subject = c.req.query('subject') === 'humans' ? 'humans' : 'models';
    const key = `${subject}:${mode}:${game}:${variant}`;
    const now = (deps.now ?? Date.now)();

    const cached = cache.get(key);
    if (cached && now - cached.at < TTL_MS) return c.json(cached.data);

    const where = and(eq(ratings.mode, mode), eq(ratings.game, game), eq(ratings.variant, variant));

    let data: unknown;
    if (subject === 'humans') {
      // Identified people only: subject_id 'human:<uuid>' joined to a named,
      // unflagged player. The anonymous aggregate 'human' never appears.
      //
      // The regex guard is load-bearing, not decoration: `::uuid` on a malformed
      // suffix raises `invalid input syntax for type uuid` and would 500 the whole
      // board. Filtering on the shape first means one bad row can never do that.
      const isHumanUuid = sql`${ratings.subjectId} ~ '^human:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;
      const rows = await deps.db
        .select({ r: ratings, nickname: players.nickname })
        .from(ratings)
        .innerJoin(
          players,
          sql`${players.id} = substring(${ratings.subjectId} from 7)::uuid AND ${isHumanUuid}`,
        )
        .where(
          and(
            where,
            isHumanUuid,
            sql`${players.nickname} IS NOT NULL`,
            sql`${players.flaggedAt} IS NULL`,
          ),
        )
        .orderBy(desc(ratings.elo));
      data = rows.map((row) => project(row.r, row.nickname!));
    } else {
      const rows = await deps.db
        .select()
        .from(ratings)
        .where(and(where, sql`${ratings.subjectId} NOT LIKE 'human%'`))
        .orderBy(desc(ratings.elo));
      data = rows.map((r) => project(r));
    }

    cache.set(key, { at: now, data });
    return c.json(data);
  });
  return app;
}
