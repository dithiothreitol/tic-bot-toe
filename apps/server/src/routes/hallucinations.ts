import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { ratings } from '../db/schema';

/**
 * GET /api/hallucinations?mode=&game=&variant= — per-model discipline ranking
 * (plan „efekt wow" §4.3, Module B, Etap 1). Public read, no JWT — same posture
 * as the leaderboard (aggregated, non-personal telemetry).
 *
 * "Hallucination" here is the everyday sense: an illegal / unparseable move the
 * model produced under the SPEC §8 protocol. Etap 1 exposes only the metric that
 * exists for the WHOLE history — the FORFEIT rate (`forfeitMoves / totalMoves`
 * from `ratings`, D5a): the share of moves where the model never gave a legal
 * answer in 4 tries and a random one was substituted. The stronger "clean first
 * try" metric (D5b) needs per-move `rejections`, captured only from Etap 2 on,
 * and joins here later.
 *
 * Rows are summed across variants by default (forfeit behaviour is a property of
 * how a model follows the move format, not of board size); pass `variant` to
 * scope to one. Ordered by discipline — lowest forfeit rate first, ties broken by
 * more moves — so a consumer can read a model's rank straight off the index. The
 * 'human' namespace is excluded: a person is not a model.
 */
export interface HallucinationRow {
  subjectId: string;
  games: number;
  totalMoves: number;
  forfeitMoves: number;
  forfeitRate: number;
}

export function hallucinationsRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    const mode = c.req.query('mode') ?? 'model_vs_model';
    const game = c.req.query('game') ?? 'tictactoe';
    const variant = c.req.query('variant'); // absent = summed across all variants

    const rows = await deps.db
      .select({
        subjectId: ratings.subjectId,
        forfeitMoves: sql<number>`sum(${ratings.forfeitMoves})::int`,
        totalMoves: sql<number>`sum(${ratings.totalMoves})::int`,
        games: sql<number>`sum(${ratings.games})::int`,
      })
      .from(ratings)
      .where(
        and(
          eq(ratings.mode, mode),
          eq(ratings.game, game),
          variant ? eq(ratings.variant, variant) : undefined,
          sql`${ratings.subjectId} NOT LIKE 'human%'`,
        ),
      )
      .groupBy(ratings.subjectId);

    const data: HallucinationRow[] = rows
      .map((r) => ({
        subjectId: r.subjectId,
        games: r.games,
        totalMoves: r.totalMoves,
        forfeitMoves: r.forfeitMoves,
        forfeitRate: r.totalMoves > 0 ? r.forfeitMoves / r.totalMoves : 0,
      }))
      // Most disciplined first (index+1 = rank). A clean record over more moves
      // outranks the same rate over a handful — ties break on move count.
      .sort((a, b) => a.forfeitRate - b.forfeitRate || b.totalMoves - a.totalMoves);

    return c.json(data);
  });
  return app;
}
