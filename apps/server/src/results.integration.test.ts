import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  type GameDefinition,
  type GameId,
  type Move,
  getGame,
} from '@arena/game-core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { newJti, signSession } from './auth/jwt';
import { loadConfig } from './config';
import { type DbHandle, createDb } from './db/client';
import { matches, ratings } from './db/schema';
import { type ResultMove, type ResultPayload, submitResult } from './db/results';
import { resetLeaderboardCache } from './routes/leaderboard';

let container: StartedPostgreSqlContainer;
let handle: DbHandle;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  handle = createDb(container.getConnectionUri());
  await handle.migrate('./drizzle');
});

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

beforeEach(async () => {
  await handle.db.execute(
    sql`TRUNCATE matches, ratings, elo_history, used_jti, predictions, daily_results RESTART IDENTITY CASCADE`,
  );
  resetLeaderboardCache();
});

/** Play a full game (first legal move each turn), build a submittable payload. */
function playOut(
  game: GameId,
  variantId: string,
  seed: number,
  latencyMs: number,
  p1Id: string,
  p2Id: string,
): ResultPayload {
  const def = getGame(game) as unknown as GameDefinition<unknown, Move>;
  const variant = def.variants.find((v) => v.id === variantId)!;
  let state = def.createInitialState(variant, { seed });
  const moves: ResultMove[] = [];
  let guard = 0;
  while (def.status(state) === 'playing' && guard++ < 500) {
    const side = def.currentPlayer(state);
    const move = def.legalMoves(state, side)[0]!;
    moves.push({
      player: side,
      move,
      telemetry: { latencyMs, retries: 0, forfeit: false, promptTokens: 10, completionTokens: 2, costUsd: 0.0001 },
    });
    state = def.applyMove(state, side, move);
  }
  return {
    mode: 'model_vs_model',
    game,
    variant: variantId,
    p1Id,
    p2Id,
    moves,
    setup: def.serializeSetup(state),
  };
}

describe('submitResult (real Postgres via testcontainers)', () => {
  it('accepts a valid match and updates both ratings from 1000', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b');
    const res = await submitResult(handle.db, newJti(), payload, '1.2.3.4');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.winner).toBe('p1');
      expect(res.ratingChanges).toHaveLength(2);
      expect(res.ratingChanges[0]).toMatchObject({ subjectId: 'openrouter:a', before: 1000 });
      expect(res.ratingChanges[0].after).toBeGreaterThan(1000);
      expect(res.ratingChanges[1].after).toBeLessThan(1000);
    }
    const rows = await handle.db.select().from(ratings);
    expect(rows).toHaveLength(2);
  });

  it('rejects an illegal move (422)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'a', 'b');
    payload.moves[2] = { ...payload.moves[2]!, move: payload.moves[0]!.move }; // occupied
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(422);
  });

  it('rejects a match whose client eval disagrees with server analysis (§15.1)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'a', 'b');
    // The first move on an empty board is 'optimal' — claiming 'blunder' is a lie.
    payload.moves[0] = { ...payload.moves[0]!, eval: { quality: 'blunder' } };
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('eval_mismatch');
  });

  it('rejects a reused jti (one-time token)', async () => {
    const jti = newJti();
    const first = await submitResult(
      handle.db,
      jti,
      playOut('tictactoe', 'standard', 0, 4000, 'a', 'b'),
      null,
    );
    expect(first.ok).toBe(true);
    const second = await submitResult(
      handle.db,
      jti,
      playOut('battleship', 'small', 5, 4000, 'a', 'b'),
      null,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('jti_used');
  });

  it('deduplicates the same match by moves_hash', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'a', 'b');
    expect((await submitResult(handle.db, newJti(), payload, null)).ok).toBe(true);
    const dup = await submitResult(handle.db, newJti(), payload, null);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe('duplicate');
  });

  it('rejects suspiciously fast OpenRouter timing (<3s avg)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 1000, 'openrouter:a', 'openrouter:b');
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('suspicious_timing');
  });

  it('saves a lab match but never touches ratings', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'a', 'b');
    payload.lab = true;
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.lab).toBe(true);
      expect(res.ratingChanges).toEqual([]);
    }
    expect(await handle.db.select().from(ratings)).toHaveLength(0);
  });

  it('marks matches with an Ollama subject as server_verified', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'ollama:llama', 'openrouter:b');
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true);
    const rows = await handle.db.select({ sv: matches.serverVerified }).from(matches);
    expect(rows[0]!.sv).toBe(true);
  });

  it('validates a battleship match via the recorded setup', async () => {
    const payload = playOut('battleship', 'small', 7, 4000, 'openrouter:a', 'openrouter:b');
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true);
    if (res.ok) expect(['p1', 'p2']).toContain(res.winner);
  });
});

describe('HTTP endpoints (real Postgres)', () => {
  it('POST /api/result requires a JWT and saves on success', async () => {
    const config = loadConfig({ JWT_SECRET: 'test-secret' });
    const app = buildApp({ config, db: handle.db });
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b');

    const noAuth = await app.request('/api/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(noAuth.status).toBe(401);

    const { token } = await signSession('test-secret', 1800, newJti());
    const res = await app.request('/api/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { winner: string }).winner).toBe('p1');
  });

  it('GET /api/leaderboard ranks winners above losers', async () => {
    const config = loadConfig({});
    const app = buildApp({ config, db: handle.db });
    await submitResult(
      handle.db,
      newJti(),
      playOut('tictactoe', 'standard', 0, 4000, 'openrouter:winner', 'openrouter:loser'),
      null,
    );
    const res = await app.request(
      '/api/leaderboard?mode=model_vs_model&game=tictactoe&variant=standard',
    );
    expect(res.status).toBe(200);
    const board = (await res.json()) as Array<{
      subjectId: string;
      elo: number;
      avgTokensPerMove: number | null;
      optimalRate: number | null;
    }>;
    expect(board).toHaveLength(2);
    expect(board[0].subjectId).toBe('openrouter:winner');
    expect(board[0].elo).toBeGreaterThan(board[1].elo);
    // §9.2 aggregate exposed for the radar "Oszczędność" axis (10+2 tokens/move).
    expect(board[0].avgTokensPerMove).toBeCloseTo(12, 5);
    // §12.2 Precyzja: optimal-rate is computed server-side, not null.
    expect(board[0].optimalRate).not.toBeNull();
    expect(board[0].optimalRate).toBeGreaterThanOrEqual(0);
    expect(board[0].optimalRate as number).toBeLessThanOrEqual(1);
  });

  it('GET /api/elo-history returns ordered checkpoints for a subject', async () => {
    const config = loadConfig({});
    const app = buildApp({ config, db: handle.db });
    await submitResult(
      handle.db,
      newJti(),
      playOut('tictactoe', 'standard', 0, 4000, 'openrouter:winner', 'openrouter:loser'),
      null,
    );
    const res = await app.request(
      '/api/elo-history?subjectId=openrouter:winner&mode=model_vs_model&game=tictactoe&variant=standard',
    );
    expect(res.status).toBe(200);
    const points = (await res.json()) as Array<{ eloAfter: number; at: string }>;
    expect(points).toHaveLength(1);
    expect(points[0].eloAfter).toBeGreaterThan(1000);
  });

  it('GET /api/head-to-head tallies wins from each perspective', async () => {
    const config = loadConfig({});
    const app = buildApp({ config, db: handle.db });
    await submitResult(
      handle.db,
      newJti(),
      playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b'), // a (p1) wins
      null,
    );
    const q = 'mode=model_vs_model&game=tictactoe&variant=standard';
    const ab = (await (
      await app.request(`/api/head-to-head?a=openrouter:a&b=openrouter:b&${q}`)
    ).json()) as { games: number; aWins: number; bWins: number; draws: number };
    expect(ab).toMatchObject({ games: 1, aWins: 1, bWins: 0, draws: 0 });

    const ba = (await (
      await app.request(`/api/head-to-head?a=openrouter:b&b=openrouter:a&${q}`)
    ).json()) as { aWins: number; bWins: number };
    expect(ba).toMatchObject({ aWins: 0, bWins: 1 });
  });
});
