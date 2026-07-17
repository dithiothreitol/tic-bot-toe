import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { GameId } from '@arena/game-core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app';
import { loadConfig } from '../config';
import { type DbHandle, createDb } from '../db/client';
import { matches } from '../db/schema';
import type { PsychologyResponse } from './psychology';

/**
 * Integration tests for GET /api/psychology (Module C) against a real Postgres:
 * the aggregation reads jsonb `moves` straight from stored rows, and the route
 * caches per (mode, game, variant, subject). A controllable clock proves the TTL.
 */

let container: StartedPostgreSqlContainer;
let handle: DbHandle;
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
  await handle.db.execute(sql`TRUNCATE matches RESTART IDENTITY CASCADE`);
});

let clock = 0;
function app() {
  return buildApp({ config: loadConfig({ JWT_SECRET }), db: handle.db, now: () => clock });
}

let hashSeq = 0;
async function insertMatch(over: {
  game: GameId;
  variant: string;
  mode?: 'model_vs_model' | 'human_vs_model';
  p1Id: string;
  p2Id: string;
  winner: 'p1' | 'p2' | 'draw';
  lab?: boolean;
  moves: unknown;
}): Promise<void> {
  await handle.db.insert(matches).values({
    mode: over.mode ?? 'model_vs_model',
    game: over.game,
    variant: over.variant,
    p1Id: over.p1Id,
    p2Id: over.p2Id,
    winner: over.winner,
    moves: over.moves,
    movesHash: `hash-${hashSeq++}`,
    lab: over.lab ?? false,
  });
}

const t = (forfeit = false) => ({ latencyMs: 4000, retries: 0, forfeit });

describe('GET /api/psychology — tic-tac-toe', () => {
  it('aggregates openings, wins-by-opening and all moves from stored jsonb', async () => {
    await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:s',
      p2Id: 'openrouter:o',
      winner: 'p1',
      moves: [
        { player: 'p1', move: 4, telemetry: t() },
        { player: 'p2', move: 0, telemetry: t() },
        { player: 'p1', move: 8, telemetry: t() },
      ],
    });
    await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:o',
      p2Id: 'openrouter:s',
      winner: 'p1', // subject was p2 here → lost
      moves: [
        { player: 'p1', move: 0, telemetry: t() },
        { player: 'p2', move: 4, telemetry: t() },
      ],
    });

    const res = await app().request(
      '/api/psychology?subjectId=openrouter:s&game=tictactoe&variant=standard',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as PsychologyResponse;
    expect(body.n).toBe(2);
    expect(body.payload?.game).toBe('tictactoe');
    if (body.payload?.game !== 'tictactoe') throw new Error('wrong game');
    expect(body.payload.firstMoveCounts[4]).toBe(2); // opened center in both
    expect(body.payload.firstMoveWins[4]).toBe(1); // won once (the p1 match)
    expect(body.payload.moveCounts[4]).toBe(2);
    expect(body.payload.moveCounts[8]).toBe(1);
    expect(body.payload.moveCounts[0]).toBe(0); // that was the opponent's cell
  });

  it('excludes forfeited moves read from stored telemetry', async () => {
    await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:s',
      p2Id: 'openrouter:o',
      winner: 'p1',
      moves: [
        { player: 'p1', move: 0, telemetry: t(true) }, // forfeit → must not count
        { player: 'p2', move: 3, telemetry: t() },
        { player: 'p1', move: 4, telemetry: t() }, // real opening
      ],
    });
    const res = await app().request(
      '/api/psychology?subjectId=openrouter:s&game=tictactoe&variant=standard',
    );
    const body = (await res.json()) as PsychologyResponse;
    if (body.payload?.game !== 'tictactoe') throw new Error('wrong game');
    expect(body.payload.firstMoveCounts[0]).toBe(0);
    expect(body.payload.firstMoveCounts[4]).toBe(1);
    expect(body.payload.moveCounts[0]).toBe(0);
  });

  it('excludes lab matches from the sample', async () => {
    await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:s',
      p2Id: 'openrouter:o',
      winner: 'p1',
      lab: true,
      moves: [{ player: 'p1', move: 4, telemetry: t() }],
    });
    const res = await app().request(
      '/api/psychology?subjectId=openrouter:s&game=tictactoe&variant=standard',
    );
    const body = (await res.json()) as PsychologyResponse;
    expect(body.n).toBe(0);
  });
});

describe('GET /api/psychology — battleship', () => {
  it('maps coordinate shots to row-major cells for the requested board size', async () => {
    await insertMatch({
      game: 'battleship',
      variant: 'small', // 6×6
      p1Id: 'openrouter:s',
      p2Id: 'openrouter:o',
      winner: 'p1',
      moves: [
        { player: 'p1', move: 'A1', telemetry: t() }, // cell 0
        { player: 'p2', move: 'C3', telemetry: t() },
        { player: 'p1', move: 'A2', telemetry: t() }, // cell 6
      ],
    });

    const res = await app().request(
      '/api/psychology?subjectId=openrouter:s&game=battleship&variant=small',
    );
    const body = (await res.json()) as PsychologyResponse;
    expect(body.payload?.game).toBe('battleship');
    if (body.payload?.game !== 'battleship') throw new Error('wrong game');
    expect(body.payload.size).toBe(6);
    expect(body.payload.shotCounts).toHaveLength(36);
    expect(body.payload.shotCounts[0]).toBe(1);
    expect(body.payload.shotCounts[6]).toBe(1);
    expect(body.payload.firstShotCounts[0]).toBe(1);
  });
});

describe('GET /api/psychology — cache TTL', () => {
  it('serves a stale-free cached snapshot until the TTL, then re-reads', async () => {
    clock = 0;
    await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:s',
      p2Id: 'openrouter:o',
      winner: 'p1',
      moves: [{ player: 'p1', move: 4, telemetry: t() }],
    });
    const a = app();

    const first = (await (
      await a.request('/api/psychology?subjectId=openrouter:s&game=tictactoe&variant=standard')
    ).json()) as PsychologyResponse;
    expect(first.n).toBe(1);

    // A new match lands, but within the TTL the cached snapshot still reads n=1.
    await insertMatch({
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:s',
      p2Id: 'openrouter:o',
      winner: 'p1',
      moves: [{ player: 'p1', move: 0, telemetry: t() }],
    });
    clock = 5 * 60_000; // < 10 min
    const cached = (await (
      await a.request('/api/psychology?subjectId=openrouter:s&game=tictactoe&variant=standard')
    ).json()) as PsychologyResponse;
    expect(cached.n).toBe(1);

    clock = 11 * 60_000; // past the TTL → fresh read sees both
    const fresh = (await (
      await a.request('/api/psychology?subjectId=openrouter:s&game=tictactoe&variant=standard')
    ).json()) as PsychologyResponse;
    expect(fresh.n).toBe(2);
  });
});

describe('GET /api/psychology — guards', () => {
  it('400s without a subjectId', async () => {
    const res = await app().request('/api/psychology?game=tictactoe');
    expect(res.status).toBe(400);
  });

  it('returns a null payload for a game without a Module C view', async () => {
    const res = await app().request(
      '/api/psychology?subjectId=openrouter:s&game=sudoku&variant=standard',
    );
    const body = (await res.json()) as PsychologyResponse;
    expect(body.payload).toBeNull();
    expect(body.n).toBe(0);
  });
});
