import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { signPuzzleToken, verifyPuzzleToken } from '../auth/jwt';
import { hashPlayerToken, isValidPlayerToken } from '../auth/player';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { matches, players, turingGuesses } from '../db/schema';

/**
 * Turing mode — „Kto jest botem?" (Module D, plan §6, D8). Show a stripped match
 * and let a viewer guess which side was the human.
 *
 * The anti-abuse design is the `puzzleToken`, not a login: `GET /next` returns the
 * moves + a SIGNED token carrying the `matchId`, and NOTHING that betrays identity
 * — no telemetry (latency is a dead giveaway), no model ids, no nicknames, no
 * duration. The `matchId` (which would let a client look up the winner/model)
 * stays hidden inside the token until `POST /guess` scores the answer server-side.
 * Identity is the pseudonymous `x-player-token` (hashed), same as predictions.
 */

/** Last-N window the puzzle is drawn from (recent matches only). */
const POOL_SIZE = 500;
/** D8: skip trivially short games — a 3-move match has no "style" to read. */
const MIN_MOVES = 6;
/** A viewer has this long to answer before the token expires. */
const PUZZLE_TTL_SECONDS = 30 * 60;
/** Detectives need a real track record before they rank (plan §6.1). */
const LEADERBOARD_MIN_ATTEMPTS = 10;

/** Which side was the human — the reserved id ('human' or 'human:<uuid>', §16). Pure, for tests. */
export function humanSideOfMatch(p1Id: string, p2Id: string): 'p1' | 'p2' | null {
  if (p1Id === 'human' || p1Id.startsWith('human:')) return 'p1';
  if (p2Id === 'human' || p2Id.startsWith('human:')) return 'p2';
  return null;
}

export function turingRoute(deps: { db: Database; config: Config }): Hono {
  const app = new Hono();

  // GET /api/turing/next?game= — a random eligible puzzle this player hasn't seen.
  app.get('/next', async (c) => {
    const game = c.req.query('game');
    const rawToken = c.req.header('x-player-token');
    // Identity is optional here: anonymous viewers still get puzzles (they may
    // just repeat one). When present, exclude matches they already guessed.
    const tokenHash = rawToken && isValidPlayerToken(rawToken) ? hashPlayerToken(rawToken) : null;

    // D8 pool filter: real human matches, decided, no forfeits (a random
    // substitute move looks "human" and ruins the game), long enough to read.
    const candidates = await deps.db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.mode, 'human_vs_model'),
          eq(matches.lab, false),
          isNotNull(matches.winner),
          eq(matches.forfeitMovesP1, 0),
          eq(matches.forfeitMovesP2, 0),
          sql`jsonb_array_length(${matches.moves}) >= ${MIN_MOVES}`,
          game ? eq(matches.game, game) : undefined,
          tokenHash
            ? sql`${matches.id} NOT IN (SELECT ${turingGuesses.matchId} FROM ${turingGuesses} WHERE ${turingGuesses.playerToken} = ${tokenHash})`
            : undefined,
        ),
      )
      .orderBy(desc(matches.createdAt))
      .limit(POOL_SIZE);

    if (candidates.length === 0) return c.json({ error: 'no_puzzles' }, 404);
    const pick = candidates[Math.floor(Math.random() * candidates.length)]!;

    const rows = await deps.db
      .select({
        game: matches.game,
        variant: matches.variant,
        setup: matches.setup,
        moves: matches.moves,
      })
      .from(matches)
      .where(eq(matches.id, pick.id))
      .limit(1);
    const m = rows[0]!;

    // Strip each move to {player, move} — the board can be replayed from this and
    // nothing else. Telemetry/thoughts/rejections never leave the server here.
    const moves = Array.isArray(m.moves)
      ? (m.moves as Array<{ player: 'p1' | 'p2'; move: unknown }>).map((mv) => ({
          player: mv.player,
          move: mv.move,
        }))
      : [];

    const puzzleToken = await signPuzzleToken(deps.config.jwtSecret, PUZZLE_TTL_SECONDS, pick.id);
    return c.json({
      puzzle: { game: m.game, variant: m.variant, setup: m.setup, moves },
      puzzleToken,
    });
  });

  // POST /api/turing/guess {puzzleToken, guess} + x-player-token — score + reveal.
  app.post('/guess', async (c) => {
    const rawToken = c.req.header('x-player-token');
    if (!rawToken || !isValidPlayerToken(rawToken)) {
      return c.json({ error: 'player_token_required' }, 401);
    }
    const tokenHash = hashPlayerToken(rawToken);

    let body: { puzzleToken?: string; guess?: string };
    try {
      body = (await c.req.json()) as { puzzleToken?: string; guess?: string };
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    const guess = body.guess;
    if (!body.puzzleToken || (guess !== 'p1' && guess !== 'p2')) {
      return c.json({ error: 'bad_request' }, 400);
    }

    // The matchId comes from the signed token, never the request body — a client
    // cannot point a guess at an arbitrary match to mine its identities.
    const claims = await verifyPuzzleToken(deps.config.jwtSecret, body.puzzleToken);
    if (!claims) return c.json({ error: 'bad_token' }, 401);

    const rows = await deps.db
      .select({ p1Id: matches.p1Id, p2Id: matches.p2Id })
      .from(matches)
      .where(eq(matches.id, claims.matchId))
      .limit(1);
    const m = rows[0];
    if (!m) return c.json({ error: 'match_not_found' }, 404);

    const humanSide = humanSideOfMatch(m.p1Id, m.p2Id);
    // The pool is human_vs_model, so this is defensive — a match with no reserved
    // id should never have been served.
    if (!humanSide) return c.json({ error: 'no_human_side' }, 422);
    const modelId = humanSide === 'p1' ? m.p2Id : m.p1Id;
    const correct = guess === humanSide;

    // One guess per person per match (PK). A second attempt is a 409 — we do not
    // re-score, so the first answer stands.
    const inserted = await deps.db
      .insert(turingGuesses)
      .values({ playerToken: tokenHash, matchId: claims.matchId, guess, correct })
      .onConflictDoNothing()
      .returning({ matchId: turingGuesses.matchId });
    if (inserted.length === 0) return c.json({ error: 'already_guessed' }, 409);

    // Reveal only now: who was human, which model played, and the match id so the
    // client can link the full replay.
    return c.json({ correct, humanSide, modelId, matchId: claims.matchId });
  });

  // GET /api/turing/leaderboard — detective accuracy, ≥10 attempts, top 50.
  app.get('/leaderboard', async (c) => {
    const correctCount = sql<number>`count(*) filter (where ${turingGuesses.correct})::int`;
    const total = sql<number>`count(*)::int`;
    // Ordered by accuracy (the whole point), ties broken by who guessed more.
    const accuracy = sql<number>`(count(*) filter (where ${turingGuesses.correct}))::float / count(*)`;

    const rows = await deps.db
      .select({ nickname: players.nickname, total, correct: correctCount })
      .from(turingGuesses)
      .innerJoin(players, eq(players.tokenHash, turingGuesses.playerToken))
      .where(and(isNotNull(players.nickname), isNull(players.flaggedAt)))
      .groupBy(players.id, players.nickname)
      .having(sql`count(*) >= ${LEADERBOARD_MIN_ATTEMPTS}`)
      .orderBy(desc(accuracy), desc(total))
      .limit(50);

    return c.json(
      rows.map((r) => ({
        nickname: r.nickname,
        correct: r.correct,
        total: r.total,
        accuracy: r.total > 0 ? r.correct / r.total : 0,
      })),
    );
  });

  return app;
}
