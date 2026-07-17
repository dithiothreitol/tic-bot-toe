import { dailyAcceptedSubjectIds, dailyChallenge, streakFrom, toDayString } from '@arena/game-core';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { hashPlayerToken, isValidPlayerToken } from '../auth/player';
import type { Database } from '../db/client';
import { dailyResults, matches } from '../db/schema';

/**
 * Daily challenge (SPEC §12.6). The challenge is DERIVED FROM THE DATE by
 * game-core, so there is no cron and nothing to store — the server recomputes it
 * and can therefore verify, on its own terms, that a submitted match really is
 * today's challenge.
 *
 * Identity: we key on the SHA-256 of the player's bearer token, never the token
 * itself (§16) — the `player_token` column holds the hash, so a DB leak reveals
 * no credentials. The nickname is not needed here.
 */

/** Only a match saved today can complete today's challenge. */
function isToday(createdAt: Date, today: string): boolean {
  return toDayString(createdAt) === today;
}

interface StoredMove {
  player: 'p1' | 'p2';
  telemetry?: { forfeit?: boolean };
}

/**
 * Did the opponent actually play?
 *
 * A retired `:free` model id (they get pulled without notice) or a 429 — routine
 * for free models — both end the same way: every call fails, the runner exhausts
 * its retries and substitutes a RANDOM legal move flagged `forfeit`. The match
 * then looks like a clean human win over a model that never made a decision.
 *
 * Beating a ghost is not beating the model, so it does not complete the day.
 * Weak-but-alive models are unaffected: one real move is enough.
 */
function opponentEverPlayed(moves: unknown, opponentSide: 'p1' | 'p2'): boolean {
  if (!Array.isArray(moves)) return false;
  const theirs = (moves as StoredMove[]).filter((m) => m?.player === opponentSide);
  if (theirs.length === 0) return false;
  return theirs.some((m) => m.telemetry?.forfeit !== true);
}

function tokenHashFrom(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const raw = c.req.header('x-player-token');
  if (!raw || !isValidPlayerToken(raw)) return null;
  return hashPlayerToken(raw);
}

async function completedDays(db: Database, tokenHash: string): Promise<string[]> {
  const rows = await db
    .select({ day: dailyResults.day })
    .from(dailyResults)
    .where(and(eq(dailyResults.playerToken, tokenHash), eq(dailyResults.completed, true)));
  return rows.map((r) => r.day);
}

export function dailyRoute(deps: { db: Database; now?: () => Date }): Hono {
  const app = new Hono();
  const today = (): string => toDayString((deps.now ?? (() => new Date()))());

  /** GET /api/daily — today's challenge + this player's streak. Public. */
  app.get('/', async (c) => {
    const day = today();
    const challenge = dailyChallenge(day);
    const hash = tokenHashFrom(c);
    if (!hash) return c.json({ challenge, streak: 0, todayCompleted: false });

    const days = await completedDays(deps.db, hash);
    return c.json({
      challenge,
      streak: streakFrom(days, day),
      todayCompleted: days.includes(day),
    });
  });

  /**
   * POST /api/daily/result — claim today's challenge with an already-saved match.
   * Everything is checked against the stored match, so the client cannot simply
   * assert that it won.
   */
  app.post('/result', async (c) => {
    const hash = tokenHashFrom(c);
    if (!hash) return c.json({ error: 'player_token_required' }, 401);

    let body: { matchId?: string };
    try {
      body = (await c.req.json()) as { matchId?: string };
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    if (!body.matchId) return c.json({ error: 'matchId required' }, 400);

    const rows = await deps.db
      .select()
      .from(matches)
      .where(eq(matches.id, body.matchId))
      .limit(1);
    const match = rows[0];
    if (!match) return c.json({ error: 'match_not_found' }, 404);

    const day = today();
    const challenge = dailyChallenge(day);

    // The match must BE today's challenge — game, variant, opponent, and freshness.
    if (!isToday(match.createdAt, day)) return c.json({ error: 'match_not_today' }, 422);
    if (match.lab) return c.json({ error: 'lab_match' }, 422);
    if (match.mode !== 'human_vs_model') return c.json({ error: 'wrong_mode' }, 422);
    if (match.game !== challenge.game || match.variant !== challenge.variant) {
      return c.json({ error: 'wrong_game' }, 422);
    }

    // The person plays p1 (§12.6); the other side must be today's opponent —
    // the pool entry or its paid twin (same model on the player's own key,
    // out of reach of the free-tier 429 pool).
    const humanIsP1 = match.p1Id === 'human' || match.p1Id.startsWith('human:');
    if (!humanIsP1) return c.json({ error: 'wrong_side' }, 422);
    if (!dailyAcceptedSubjectIds(challenge).includes(match.p2Id)) {
      return c.json({ error: 'wrong_opponent' }, 422);
    }

    // Only a win counts (§12.6: "Pokonaj dziś {model}").
    if (match.winner !== 'p1') return c.json({ error: 'not_won' }, 422);

    // …and only a win over an opponent that actually played (see above).
    if (!opponentEverPlayed(match.moves, 'p2')) {
      return c.json({ error: 'opponent_never_played' }, 422);
    }

    await deps.db
      .insert(dailyResults)
      .values({ playerToken: hash, day, completed: true, matchId: match.id })
      .onConflictDoUpdate({
        target: [dailyResults.playerToken, dailyResults.day],
        set: { completed: true, matchId: match.id },
      });

    const days = await completedDays(deps.db, hash);
    return c.json({ completed: true, streak: streakFrom(days, day), day });
  });

  return app;
}
