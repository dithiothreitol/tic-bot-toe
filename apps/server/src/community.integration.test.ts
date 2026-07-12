import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  type GameId,
  dailyChallenge,
  dailySubjectId,
  toDayString,
} from '@arena/game-core';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { newJti, signSession } from './auth/jwt';
import { hashPlayerToken } from './auth/player';
import { loadConfig } from './config';
import { type DbHandle, createDb } from './db/client';
import { dailyResults, matches, players, predictions } from './db/schema';

/**
 * Integration tests for the community endpoints (SPEC §12.5/§12.6) against a
 * real Postgres. The point of these is that the SERVER decides everything:
 * whether a prediction was right, and whether a daily challenge was completed.
 */

let container: StartedPostgreSqlContainer;
let handle: DbHandle;

const PLAYER_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';
const TOKEN_HASH = hashPlayerToken(PLAYER_TOKEN);
const JWT_SECRET = 'test-secret';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  handle = createDb(container.getConnectionUri());
  await handle.migrate('./drizzle');
}, 120_000);

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

beforeEach(async () => {
  await handle.db.execute(
    sql`TRUNCATE matches, ratings, elo_history, used_jti, predictions, daily_results, players RESTART IDENTITY CASCADE`,
  );
});

function app() {
  return buildApp({ config: loadConfig({ JWT_SECRET }), db: handle.db });
}

async function session(): Promise<string> {
  const { token } = await signSession(JWT_SECRET, 1800, newJti());
  return token;
}

/** Insert a finished match row directly — these tests are about the endpoints. */
async function insertMatch(over: {
  game: GameId;
  variant: string;
  mode: 'model_vs_model' | 'human_vs_model';
  p1Id: string;
  p2Id: string;
  winner: 'p1' | 'p2' | 'draw';
  lab?: boolean;
  movesHash?: string;
  createdAt?: Date;
  moves?: unknown;
}): Promise<string> {
  const rows = await handle.db
    .insert(matches)
    .values({
      mode: over.mode,
      game: over.game,
      variant: over.variant,
      p1Id: over.p1Id,
      p2Id: over.p2Id,
      winner: over.winner,
      moves: over.moves ?? realMoves(),
      movesHash: over.movesHash ?? `hash-${Math.random()}`,
      lab: over.lab ?? false,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    })
    .returning({ id: matches.id });
  return rows[0]!.id;
}

const tele = (forfeit: boolean) => ({ latencyMs: 4000, retries: 0, forfeit });

/** A match where the opponent actually made decisions. */
function realMoves(): unknown {
  return [
    { player: 'p1', move: 4, telemetry: tele(false) },
    { player: 'p2', move: 0, telemetry: tele(false) },
    { player: 'p1', move: 8, telemetry: tele(false) },
  ];
}

/** A match where every one of the opponent's moves was a forfeited random move. */
function ghostMoves(): unknown {
  return [
    { player: 'p1', move: 4, telemetry: tele(false) },
    { player: 'p2', move: 0, telemetry: tele(true) },
    { player: 'p1', move: 8, telemetry: tele(false) },
    { player: 'p2', move: 1, telemetry: tele(true) },
  ];
}

/** The daily challenge is derived from the date, so the test derives it too. */
function todayChallenge() {
  return dailyChallenge(toDayString(new Date()));
}

/** A match that IS today's challenge, won by the human. */
async function winningDailyMatch(): Promise<string> {
  const c = todayChallenge();
  return insertMatch({
    game: c.game,
    variant: c.variant,
    mode: 'human_vs_model',
    p1Id: 'human',
    p2Id: dailySubjectId(c.opponent),
    winner: 'p1',
  });
}

describe('POST /api/prediction (§12.5)', () => {
  it('scores a correct guess against the winner stored by the server', async () => {
    const matchId = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'openrouter:a',
      p2Id: 'openrouter:b',
      winner: 'p1',
    });

    const res = await app().request('/api/prediction', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await session()}`,
        'x-player-token': PLAYER_TOKEN,
      },
      body: JSON.stringify({ matchId, predicted: 'p1' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correct: true, winner: 'p1' });

    const rows = await handle.db.select().from(predictions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.correct).toBe(true);
    // The raw bearer token is NEVER stored — only its SHA-256 (§16).
    expect(rows[0]!.playerToken).toBe(TOKEN_HASH);
    expect(rows[0]!.playerToken).not.toBe(PLAYER_TOKEN);
  });

  it('marks a wrong guess as incorrect — the client cannot claim otherwise', async () => {
    const matchId = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'openrouter:a',
      p2Id: 'openrouter:b',
      winner: 'p2',
    });

    const res = await app().request('/api/prediction', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await session()}`,
        'x-player-token': PLAYER_TOKEN,
      },
      body: JSON.stringify({ matchId, predicted: 'p1' }),
    });

    expect(await res.json()).toMatchObject({ correct: false, winner: 'p2' });
  });

  it('requires a JWT', async () => {
    const matchId = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'a',
      p2Id: 'b',
      winner: 'p1',
    });
    const res = await app().request('/api/prediction', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': PLAYER_TOKEN },
      body: JSON.stringify({ matchId, predicted: 'p1' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a second prediction on the same match (no point farming)', async () => {
    const matchId = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'a',
      p2Id: 'b',
      winner: 'p1',
    });
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${await session()}`,
      'x-player-token': PLAYER_TOKEN,
    };
    const body = JSON.stringify({ matchId, predicted: 'p1' });

    expect((await app().request('/api/prediction', { method: 'POST', headers, body })).status).toBe(200);
    const dup = await app().request('/api/prediction', { method: 'POST', headers, body });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: 'already_predicted' });
  });

  it('refuses to "predict" an old match (its winner is already public)', async () => {
    const matchId = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'a',
      p2Id: 'b',
      winner: 'p1',
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // an hour ago
    });

    const res = await app().request('/api/prediction', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await session()}`,
        'x-player-token': PLAYER_TOKEN,
      },
      body: JSON.stringify({ matchId, predicted: 'p1' }),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'match_too_old' });
  });
});

describe('GET /api/predictions/leaderboard (§12.5)', () => {
  it('ranks by points and takes the nickname from the players table, not the request', async () => {
    await handle.db.insert(players).values({ tokenHash: TOKEN_HASH, nickname: 'Wieszczka' });
    const matchId = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'a',
      p2Id: 'b',
      winner: 'p1',
    });
    const other = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'a',
      p2Id: 'b',
      winner: 'p2',
    });
    await handle.db.insert(predictions).values([
      { playerToken: TOKEN_HASH, matchId, predicted: 'p1', correct: true },
      { playerToken: TOKEN_HASH, matchId: other, predicted: 'p1', correct: false },
    ]);

    const res = await app().request('/api/predictions/leaderboard');
    const rows = (await res.json()) as Array<{
      nickname: string;
      points: number;
      total: number;
      accuracy: number;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nickname: 'Wieszczka', points: 1, total: 2 });
    expect(rows[0]!.accuracy).toBeCloseTo(0.5, 5);
  });

  it('hides players who have not chosen a nickname', async () => {
    await handle.db.insert(players).values({ tokenHash: TOKEN_HASH }); // no nickname
    const matchId = await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      mode: 'model_vs_model',
      p1Id: 'a',
      p2Id: 'b',
      winner: 'p1',
    });
    await handle.db
      .insert(predictions)
      .values({ playerToken: TOKEN_HASH, matchId, predicted: 'p1', correct: true });

    const res = await app().request('/api/predictions/leaderboard');
    expect(await res.json()).toEqual([]);
  });
});

describe('GET /api/daily (§12.6)', () => {
  it('serves today’s challenge, identical to what game-core derives from the date', async () => {
    const res = await app().request('/api/daily');
    const body = (await res.json()) as { challenge: unknown; streak: number };
    expect(body.challenge).toEqual(todayChallenge());
    expect(body.streak).toBe(0);
  });
});

describe('POST /api/daily/result (§12.6)', () => {
  const post = async (matchId: string) =>
    app().request('/api/daily/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': PLAYER_TOKEN },
      body: JSON.stringify({ matchId }),
    });

  it('completes the day for a real win over today’s opponent, and starts the streak', async () => {
    const res = await post(await winningDailyMatch());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ completed: true, streak: 1 });

    const rows = await handle.db
      .select()
      .from(dailyResults)
      .where(eq(dailyResults.playerToken, TOKEN_HASH));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.completed).toBe(true);
  });

  it('extends the streak across consecutive days', async () => {
    const today = toDayString(new Date());
    const yesterday = toDayString(new Date(Date.now() - 86_400_000));
    await handle.db
      .insert(dailyResults)
      .values({ playerToken: TOKEN_HASH, day: yesterday, completed: true });

    const res = await post(await winningDailyMatch());
    expect(await res.json()).toMatchObject({ completed: true, streak: 2, day: today });
  });

  it('rejects a LOSS — you cannot claim a day you did not win', async () => {
    const c = todayChallenge();
    const lost = await insertMatch({
      game: c.game,
      variant: c.variant,
      mode: 'human_vs_model',
      p1Id: 'human',
      p2Id: dailySubjectId(c.opponent),
      winner: 'p2',
    });
    const res = await post(lost);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'not_won' });
    expect(await handle.db.select().from(dailyResults)).toHaveLength(0);
  });

  it('rejects a win against the WRONG opponent', async () => {
    const c = todayChallenge();
    const wrong = await insertMatch({
      game: c.game,
      variant: c.variant,
      mode: 'human_vs_model',
      p1Id: 'human',
      p2Id: 'openrouter:some-other-model',
      winner: 'p1',
    });
    const res = await post(wrong);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'wrong_opponent' });
  });

  it('rejects a "win" over an opponent that never played (retired id / 429 → forfeits)', async () => {
    const c = todayChallenge();
    const ghost = await insertMatch({
      game: c.game,
      variant: c.variant,
      mode: 'human_vs_model',
      p1Id: 'human',
      p2Id: dailySubjectId(c.opponent),
      winner: 'p1',
      moves: ghostMoves(), // every opponent move was a forfeited random move
    });
    const res = await post(ghost);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'opponent_never_played' });
    expect(await handle.db.select().from(dailyResults)).toHaveLength(0);
  });

  it('still accepts a win over a weak-but-alive model (one real move is enough)', async () => {
    const c = todayChallenge();
    const weak = await insertMatch({
      game: c.game,
      variant: c.variant,
      mode: 'human_vs_model',
      p1Id: 'human',
      p2Id: dailySubjectId(c.opponent),
      winner: 'p1',
      moves: [
        { player: 'p1', move: 4, telemetry: tele(false) },
        { player: 'p2', move: 0, telemetry: tele(true) }, // forfeited one…
        { player: 'p1', move: 8, telemetry: tele(false) },
        { player: 'p2', move: 1, telemetry: tele(false) }, // …but did decide once
      ],
    });
    const res = await post(weak);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ completed: true, streak: 1 });
  });

  it('rejects a lab match (a tuned prompt must not win the day)', async () => {
    const c = todayChallenge();
    const lab = await insertMatch({
      game: c.game,
      variant: c.variant,
      mode: 'human_vs_model',
      p1Id: 'human',
      p2Id: dailySubjectId(c.opponent),
      winner: 'p1',
      lab: true,
    });
    const res = await post(lab);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'lab_match' });
  });

  it('requires a player token', async () => {
    const res = await app().request('/api/daily/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchId: await winningDailyMatch() }),
    });
    expect(res.status).toBe(401);
  });
});
