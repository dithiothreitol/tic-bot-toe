import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { verifySession } from '../auth/jwt';
import { hashPlayerToken, isValidPlayerToken } from '../auth/player';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { matches, players, predictions } from '../db/schema';

/**
 * Viewer predictions — "Zgadywanka widza" (SPEC §12.5). Zero stakes, points only.
 *
 * Scoring is done SERVER-SIDE against the winner already stored in `matches`
 * (which itself came from a server replay, §15.1). The client never asserts that
 * it guessed right — it only says what it guessed and for which match.
 *
 * Anti-farming: the obvious abuse is to read a finished match's winner and then
 * "predict" it. Three cheap layers make that pointless rather than impossible
 * (§15: the browser can never be fully trusted):
 *   1. the match must be FRESH — a prediction lands seconds after the match is
 *      saved, so old matches cannot be mined;
 *   2. one prediction per person per match (checked before insert);
 *   3. JWT + a 60/h rate limit, same as every other write endpoint.
 */
const PREDICTION_WINDOW_MS = 10 * 60 * 1000;
const SIDES = ['p1', 'p2', 'draw'] as const;
type Side = (typeof SIDES)[number];

export function predictionRoute(deps: {
  db: Database;
  config: Config;
  now?: () => number;
}): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    const auth = c.req.header('authorization') ?? '';
    const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!(await verifySession(deps.config.jwtSecret, jwt))) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const rawToken = c.req.header('x-player-token');
    if (!rawToken || !isValidPlayerToken(rawToken)) {
      return c.json({ error: 'player_token_required' }, 401);
    }
    const tokenHash = hashPlayerToken(rawToken);

    let body: { matchId?: string; predicted?: string };
    try {
      body = (await c.req.json()) as { matchId?: string; predicted?: string };
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    const predicted = body.predicted as Side | undefined;
    if (!body.matchId || !predicted || !SIDES.includes(predicted)) {
      return c.json({ error: 'bad_request' }, 400);
    }

    const rows = await deps.db
      .select({ id: matches.id, winner: matches.winner, createdAt: matches.createdAt, lab: matches.lab })
      .from(matches)
      .where(eq(matches.id, body.matchId))
      .limit(1);
    const match = rows[0];
    if (!match) return c.json({ error: 'match_not_found' }, 404);
    if (match.lab) return c.json({ error: 'lab_match' }, 422);

    const now = (deps.now ?? Date.now)();
    if (now - match.createdAt.getTime() > PREDICTION_WINDOW_MS) {
      return c.json({ error: 'match_too_old' }, 422);
    }

    const existing = await deps.db
      .select({ id: predictions.id })
      .from(predictions)
      .where(
        and(eq(predictions.playerToken, tokenHash), eq(predictions.matchId, match.id)),
      )
      .limit(1);
    if (existing.length > 0) return c.json({ error: 'already_predicted' }, 409);

    // The winner is the server's, from its own replay — this is the whole point.
    const correct = match.winner === predicted;
    await deps.db.insert(predictions).values({
      playerToken: tokenHash,
      matchId: match.id,
      predicted,
      correct,
    });

    return c.json({ correct, winner: match.winner });
  });

  return app;
}

/**
 * GET /api/predictions/leaderboard — "Ranking intuicji". The nickname comes from
 * the players table (joined on the token hash), never from the request, so a
 * client cannot post points under someone else's name. Flagged players and
 * players without a nickname are not listed (same posture as the human board).
 */
export function predictionsLeaderboardRoute(deps: { db: Database }): Hono {
  const app = new Hono();

  app.get('/leaderboard', async (c) => {
    const correctCount = sql<number>`count(*) filter (where ${predictions.correct})::int`;
    const rows = await deps.db
      .select({
        nickname: players.nickname,
        total: sql<number>`count(*)::int`,
        correct: correctCount,
      })
      .from(predictions)
      .innerJoin(players, eq(players.tokenHash, predictions.playerToken))
      .where(and(isNotNull(players.nickname), isNull(players.flaggedAt)))
      .groupBy(players.id, players.nickname)
      .orderBy(desc(correctCount))
      .limit(50);

    return c.json(
      rows.map((r) => ({
        nickname: r.nickname,
        points: r.correct,
        total: r.total,
        accuracy: r.total > 0 ? r.correct / r.total : 0,
      })),
    );
  });

  return app;
}
