import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { GameId } from '@arena/game-core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app';
import { hashPlayerToken } from '../auth/player';
import { loadConfig } from '../config';
import { type DbHandle, createDb } from '../db/client';
import { matches, players, turingGuesses } from '../db/schema';

/**
 * Integration tests for Turing mode (Module D) against a real Postgres. The point:
 * the server hides the matchId inside the puzzle token and only reveals identities
 * when it scores the guess; a person can guess each match at most once.
 */

let container: StartedPostgreSqlContainer;
let handle: DbHandle;
const JWT_SECRET = 'test-secret';
const PLAYER_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';
const TOKEN_HASH = hashPlayerToken(PLAYER_TOKEN);

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
    sql`TRUNCATE matches, turing_guesses, players RESTART IDENTITY CASCADE`,
  );
});

function app() {
  return buildApp({ config: loadConfig({ JWT_SECRET }), db: handle.db });
}

const tele = (forfeit = false) => ({ latencyMs: 4000, retries: 0, forfeit });

/** Six alternating moves — long enough for the D8 pool. */
function sixMoves(): unknown {
  return [
    { player: 'p1', move: 0, telemetry: tele() },
    { player: 'p2', move: 1, telemetry: tele() },
    { player: 'p1', move: 2, telemetry: tele() },
    { player: 'p2', move: 3, telemetry: tele() },
    { player: 'p1', move: 4, telemetry: tele() },
    { player: 'p2', move: 5, telemetry: tele() },
  ];
}

let hashSeq = 0;
async function insertMatch(over: {
  game?: GameId;
  variant?: string;
  mode?: 'model_vs_model' | 'human_vs_model';
  p1Id: string;
  p2Id: string;
  winner?: 'p1' | 'p2' | 'draw' | null;
  lab?: boolean;
  forfeitP1?: number;
  forfeitP2?: number;
  moves?: unknown;
}): Promise<string> {
  const rows = await handle.db
    .insert(matches)
    .values({
      mode: over.mode ?? 'human_vs_model',
      game: over.game ?? 'tictactoe',
      variant: over.variant ?? 'standard',
      p1Id: over.p1Id,
      p2Id: over.p2Id,
      winner: over.winner === undefined ? 'p1' : over.winner,
      moves: over.moves ?? sixMoves(),
      movesHash: `hash-${hashSeq++}`,
      lab: over.lab ?? false,
      forfeitMovesP1: over.forfeitP1 ?? 0,
      forfeitMovesP2: over.forfeitP2 ?? 0,
    })
    .returning({ id: matches.id });
  return rows[0]!.id;
}

async function nextPuzzle(headers: Record<string, string> = {}) {
  const res = await app().request('/api/turing/next', { headers });
  return res;
}

async function guess(puzzleToken: string, g: 'p1' | 'p2', token = PLAYER_TOKEN) {
  return app().request('/api/turing/guess', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-player-token': token },
    body: JSON.stringify({ puzzleToken, guess: g }),
  });
}

describe('GET /api/turing/next', () => {
  it('returns a stripped puzzle + token, with no identities or telemetry', async () => {
    await insertMatch({ p1Id: 'human:abc', p2Id: 'openrouter:bot' });
    const res = await nextPuzzle();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      puzzle: { game: string; variant: string; moves: Array<Record<string, unknown>> };
      puzzleToken: string;
    };
    expect(body.puzzleToken).toBeTruthy();
    expect(body.puzzle.game).toBe('tictactoe');
    expect(body.puzzle.moves).toHaveLength(6);
    // Each move carries ONLY player+move — telemetry never leaks (latency betrays the human).
    for (const mv of body.puzzle.moves) {
      expect(Object.keys(mv).sort()).toEqual(['move', 'player']);
    }
    // The response body must not contain any subject id.
    expect(JSON.stringify(body)).not.toContain('openrouter:bot');
    expect(JSON.stringify(body)).not.toContain('human:abc');
  });

  it('returns 200 { puzzle: null } when the pool is empty (all matches ineligible)', async () => {
    await insertMatch({ p1Id: 'openrouter:a', p2Id: 'openrouter:b', mode: 'model_vs_model' }); // not human
    await insertMatch({ p1Id: 'human:x', p2Id: 'openrouter:b', lab: true }); // lab
    await insertMatch({ p1Id: 'human:x', p2Id: 'openrouter:b', winner: null }); // unfinished
    await insertMatch({ p1Id: 'human:x', p2Id: 'openrouter:b', forfeitP2: 1 }); // had a forfeit
    await insertMatch({
      p1Id: 'human:x',
      p2Id: 'openrouter:b',
      moves: [
        { player: 'p1', move: 0, telemetry: tele() },
        { player: 'p2', move: 1, telemetry: tele() },
      ], // too short (<6)
    });
    const res = await nextPuzzle();
    expect(res.status).toBe(200);
    expect((await res.json()) as { puzzle: unknown }).toEqual({ puzzle: null });
  });

  it('excludes sudoku/scrabble matches — the puzzle UI cannot draw their board', async () => {
    // Eligible in every OTHER respect (human, decided, 6 moves, no forfeits)…
    await insertMatch({ game: 'sudoku', p1Id: 'human:x', p2Id: 'openrouter:b' });
    await insertMatch({ game: 'scrabble', variant: 'pl', p1Id: 'human:x', p2Id: 'openrouter:b' });
    // …but neither is renderable, so the pool is empty.
    const res = await nextPuzzle();
    expect((await res.json()) as { puzzle: unknown }).toEqual({ puzzle: null });
  });

  it('excludes matches this player already guessed', async () => {
    const id = await insertMatch({ p1Id: 'human:abc', p2Id: 'openrouter:bot' });
    await handle.db
      .insert(turingGuesses)
      .values({ playerToken: TOKEN_HASH, matchId: id, guess: 'p1', correct: true });
    const res = await nextPuzzle({ 'x-player-token': PLAYER_TOKEN });
    // The only match is already guessed → empty pool → null puzzle.
    expect((await res.json()) as { puzzle: unknown }).toEqual({ puzzle: null });
  });
});

describe('POST /api/turing/guess', () => {
  it('scores against the reserved human side and reveals identities', async () => {
    await insertMatch({ p1Id: 'human:abc', p2Id: 'openrouter:bot', winner: 'p1' });
    const puzzle = (await (await nextPuzzle()).json()) as { puzzleToken: string };

    const res = await guess(puzzle.puzzleToken, 'p1'); // p1 was the human → correct
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      correct: boolean;
      humanSide: string;
      modelId: string;
      matchId: string;
    };
    expect(body).toMatchObject({ correct: true, humanSide: 'p1', modelId: 'openrouter:bot' });
    expect(body.matchId).toBeTruthy();
  });

  it('marks a wrong guess incorrect', async () => {
    await insertMatch({ p1Id: 'openrouter:bot', p2Id: 'human:abc' });
    const puzzle = (await (await nextPuzzle()).json()) as { puzzleToken: string };
    const body = (await (await guess(puzzle.puzzleToken, 'p1')).json()) as { correct: boolean; humanSide: string };
    expect(body).toMatchObject({ correct: false, humanSide: 'p2' });
  });

  it('rejects a second guess on the same match (PK dedup → 409)', async () => {
    await insertMatch({ p1Id: 'human:abc', p2Id: 'openrouter:bot' });
    const puzzle = (await (await nextPuzzle()).json()) as { puzzleToken: string };
    expect((await guess(puzzle.puzzleToken, 'p1')).status).toBe(200);
    expect((await guess(puzzle.puzzleToken, 'p2')).status).toBe(409);
  });

  it('rejects a forged / non-puzzle token', async () => {
    const res = await guess('not-a-real-token', 'p1');
    expect(res.status).toBe(401);
  });

  it('requires a player token', async () => {
    await insertMatch({ p1Id: 'human:abc', p2Id: 'openrouter:bot' });
    const puzzle = (await (await nextPuzzle()).json()) as { puzzleToken: string };
    const res = await app().request('/api/turing/guess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ puzzleToken: puzzle.puzzleToken, guess: 'p1' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/turing/leaderboard', () => {
  it('lists detectives with >=10 attempts, ordered by accuracy, with the players nickname', async () => {
    await handle.db.insert(players).values({ tokenHash: TOKEN_HASH, nickname: 'sherlock' });
    // 10 guesses, 7 correct → 70% accuracy.
    const rows = Array.from({ length: 10 }, (_, i) => ({
      playerToken: TOKEN_HASH,
      matchId: '00000000-0000-0000-0000-0000000000' + String(10 + i),
      guess: 'p1' as const,
      correct: i < 7,
    }));
    // match_id has an FK → insert a throwaway match per guess.
    for (const r of rows) {
      const id = await insertMatch({ p1Id: 'human:x', p2Id: 'openrouter:b' });
      r.matchId = id;
    }
    await handle.db.insert(turingGuesses).values(rows);

    const res = await app().request('/api/turing/leaderboard');
    const body = (await res.json()) as Array<{ nickname: string; correct: number; total: number; accuracy: number }>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ nickname: 'sherlock', correct: 7, total: 10 });
    expect(body[0]!.accuracy).toBeCloseTo(0.7);
  });

  it('omits detectives below the attempt threshold', async () => {
    await handle.db.insert(players).values({ tokenHash: TOKEN_HASH, nickname: 'rookie' });
    for (let i = 0; i < 5; i++) {
      const id = await insertMatch({ p1Id: 'human:x', p2Id: 'openrouter:b' });
      await handle.db
        .insert(turingGuesses)
        .values({ playerToken: TOKEN_HASH, matchId: id, guess: 'p1', correct: true });
    }
    const res = await app().request('/api/turing/leaderboard');
    expect((await res.json()) as unknown[]).toHaveLength(0);
  });
});
