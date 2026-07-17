import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { failureGallery, ratings } from '../db/schema';

/**
 * GET /api/hallucinations?mode=&game=&variant= — per-model discipline ranking
 * (plan „efekt wow" §4.3, Module B). Public read, no JWT — same posture as the
 * leaderboard (aggregated, non-personal telemetry).
 *
 * "Hallucination" here is the everyday sense: an illegal / unparseable move the
 * model produced under the SPEC §8 protocol. Two metrics, honest about what each
 * covers (D5):
 *  - `forfeitRate` (D5a) = `forfeitMoves / totalMoves` — available for the WHOLE
 *    history; the sort key.
 *  - `cleanFirstTryRate` (D5b) = share of CAPTURED moves with no illegal/
 *    unparseable attempt. Only meaningful for moves seen since Etap 2, so it
 *    divides by `capturedMoves` (0 for pre-capture rows → `null`, never a fake
 *    100%). `since` dates the capture era for the game (null if nothing yet).
 *
 * Rows are summed across variants by default (forfeit behaviour is a property of
 * how a model follows the move format, not of board size); pass `variant` to
 * scope to one. Ordered by discipline — lowest forfeit rate first, ties broken by
 * more moves — so a consumer reads a model's rank off the index. The 'human'
 * namespace is excluded: a person is not a model.
 */
export interface HallucinationRow {
  subjectId: string;
  games: number;
  totalMoves: number;
  forfeitMoves: number;
  forfeitRate: number;
  /** Moves seen since capture began (Etap 2). Denominator for `cleanFirstTryRate`. */
  capturedMoves: number;
  rejectedAttempts: number;
  movesWithRejections: number;
  /** null until this model has captured moves — never a pre-capture fake 100%. */
  cleanFirstTryRate: number | null;
  /** ISO date the capture era starts for this game, or null if none captured yet. */
  since: string | null;
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
        capturedMoves: sql<number>`sum(${ratings.capturedMoves})::int`,
        rejectedAttempts: sql<number>`sum(${ratings.rejectedAttempts})::int`,
        movesWithRejections: sql<number>`sum(${ratings.movesWithRejections})::int`,
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

    // When capture began for this game — a UI caveat for the D5b metric. Null
    // when nothing has been captured yet (the metric then simply reads 100%/null).
    const sinceRows = await deps.db
      .select({ since: sql<string | null>`min(${failureGallery.createdAt})::text` })
      .from(failureGallery)
      .where(eq(failureGallery.game, game));
    const since = sinceRows[0]?.since ?? null;

    const data: HallucinationRow[] = rows
      .map((r) => ({
        subjectId: r.subjectId,
        games: r.games,
        totalMoves: r.totalMoves,
        forfeitMoves: r.forfeitMoves,
        forfeitRate: r.totalMoves > 0 ? r.forfeitMoves / r.totalMoves : 0,
        capturedMoves: r.capturedMoves,
        rejectedAttempts: r.rejectedAttempts,
        movesWithRejections: r.movesWithRejections,
        cleanFirstTryRate:
          r.capturedMoves > 0
            ? (r.capturedMoves - r.movesWithRejections) / r.capturedMoves
            : null,
        since,
      }))
      // Most disciplined first (index+1 = rank). A clean record over more moves
      // outranks the same rate over a handful — ties break on move count.
      .sort((a, b) => a.forfeitRate - b.forfeitRate || b.totalMoves - a.totalMoves);

    return c.json(data);
  });
  return app;
}
