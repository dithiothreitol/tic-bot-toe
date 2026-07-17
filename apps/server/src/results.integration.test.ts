import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  type GameDefinition,
  type GameId,
  type Move,
  type SudokuState,
  clearLexicons,
  getGame,
  miniLexicon,
  registerLexicon,
  scrabble,
  sudoku,
} from '@arena/game-core';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { newJti, signSession, signStartToken } from './auth/jwt';
import { type PlayerRecord, resolvePlayer } from './auth/player';
import { loadConfig } from './config';
import { type DbHandle, createDb } from './db/client';
import { failureGallery, matches, players, ratings } from './db/schema';
import {
  type ResultMove,
  type ResultPayload,
  type StartProof,
  type SubmitOptions,
  submitResult,
} from './db/results';
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
    sql`TRUNCATE matches, ratings, elo_history, used_jti, predictions, daily_results, players RESTART IDENTITY CASCADE`,
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

/**
 * A DECISIVE sudoku match: p1 always plays the solution digit (+1 every time);
 * p2 plays a rules-consistent but wrong digit when one exists (−1). p1 therefore
 * wins clearly, so both ratings move off 1000. Mirrors a real p1-vs-p2 game — a
 * valid, replayable move sequence the server can re-run.
 */
function playSudoku(variantId: string, seed: number, p1Id: string, p2Id: string): ResultPayload {
  const variant = sudoku.variants.find((v) => v.id === variantId)!;
  let state: SudokuState = sudoku.createInitialState(variant, { seed });
  const moves: ResultMove[] = [];
  const tele = { latencyMs: 4000, retries: 0, forfeit: false, promptTokens: 40, completionTokens: 4, costUsd: 0.0002 };
  let guard = 0;
  while (sudoku.status(state) === 'playing' && guard++ < 500) {
    const side = sudoku.currentPlayer(state);
    const size = state.size;
    let move: string;
    if (side === 'p1') {
      const cell = state.board.findIndex((v) => v === null);
      move = `r${Math.floor(cell / size) + 1}c${(cell % size) + 1}=${state.solution[cell]}`;
    } else {
      const legal = sudoku.legalMoves(state, side);
      const wrong = legal.find((m) => {
        const g = /r(\d+)c(\d+)=(\d)/.exec(m)!;
        const cell = (Number(g[1]) - 1) * size + (Number(g[2]) - 1);
        return state.solution[cell] !== Number(g[3]);
      });
      move = wrong ?? legal[0]!;
    }
    moves.push({ player: side, move, telemetry: { ...tele } });
    state = sudoku.applyMove(state, side, move);
  }
  return { mode: 'model_vs_model', game: 'sudoku', variant: variantId, p1Id, p2Id, moves, setup: sudoku.serializeSetup(state) };
}

/** A short valid scrabble match (4 passes → the game ends on the scoreless rule). */
function playScrabblePasses(seed: number, p1Id: string, p2Id: string): ResultPayload {
  let st = scrabble.createInitialState({ id: 'pl', label: '' }, { seed });
  const moves: ResultMove[] = [];
  const tele = { latencyMs: 4000, retries: 0, forfeit: false, promptTokens: 20, completionTokens: 2, costUsd: 0.0001 };
  for (let i = 0; i < 4 && scrabble.status(st) === 'playing'; i++) {
    const side = scrabble.currentPlayer(st);
    moves.push({ player: side, move: 'PASS', telemetry: { ...tele } });
    st = scrabble.applyMove(st, side, 'PASS');
  }
  return { mode: 'model_vs_model', game: 'scrabble', variant: 'pl', p1Id, p2Id, moves, setup: scrabble.serializeSetup(st) };
}

/**
 * A human_vs_model payload: p1 is the literal 'human', p2 an OpenRouter model.
 * Battleship + a seed gives a distinct move sequence per game (tictactoe's
 * first-legal-move line is deterministic and would dedup on moves_hash).
 * The person's move times vary — a real player is neither instant nor metronomic
 * (§15.3), so a constant latency would trip the human-timing sanity check.
 */
function playHuman(seed: number, modelId = 'openrouter:opp'): ResultPayload {
  const base = playOut('battleship', 'small', seed, 4000, 'human', modelId);
  let i = 0;
  return {
    ...base,
    mode: 'human_vs_model',
    moves: base.moves.map((m) =>
      m.player === 'p1'
        ? { ...m, telemetry: { ...m.telemetry, latencyMs: 1500 + ((i++ * 373) % 2500) } }
        : m,
    ),
  };
}

/** Frozen clock + a start token issued `agoMs` ago (§15.3 pacing). */
const NOW = 1_800_000_000_000;
const clock = () => NOW;

function startedAgo(agoMs: number): StartProof {
  return { jti: newJti(), iat: Math.floor((NOW - agoMs) / 1000) };
}

/** Options for a ranked human match that has been played at a believable pace. */
function humanOpts(player: PlayerRecord | null, agoMs = 20 * 60_000): SubmitOptions {
  return { player, start: startedAgo(agoMs), now: clock };
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

  it('round-trips Module A/B fields into matches.moves, trimming the trace (D1/D4)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b');
    payload.moves[0] = {
      ...payload.moves[0]!,
      thoughts: 'x'.repeat(5000),
      rejections: [{ kind: 'illegal', reason: 'occupied', attempted: '4' }],
    };
    const res = await submitResult(handle.db, newJti(), payload, '1.2.3.4');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [row] = await handle.db.select().from(matches).where(eq(matches.id, res.matchId));
    const stored = row!.moves as ResultMove[];
    // The trace survives the save→read path but is trimmed to the server ceiling.
    expect(stored[0]!.thoughts).toHaveLength(2000);
    expect(stored[0]!.rejections).toHaveLength(1);
    // A move without the fields stays clean (legacy shape preserved).
    expect(stored[1]).not.toHaveProperty('thoughts');
  });

  it('strips Module A/B fields from the human side before storage (D1)', async () => {
    const player = await resolvePlayer(handle.db, 'a'.repeat(40));
    const payload = playHuman(1);
    // Smuggle a trace onto the human (p1) side and onto the model (p2) side.
    payload.moves = payload.moves.map((m) =>
      m.player === 'p1'
        ? { ...m, thoughts: 'humans do not think in tokens', rejections: [{ kind: 'transport' }] }
        : { ...m, thoughts: 'model reasoning' },
    );
    const res = await submitResult(handle.db, newJti(), payload, '5.6.7.8', humanOpts(player));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [row] = await handle.db.select().from(matches).where(eq(matches.id, res.matchId));
    const stored = row!.moves as ResultMove[];
    const humanMove = stored.find((m) => m.player === 'p1')!;
    const modelMove = stored.find((m) => m.player === 'p2')!;
    expect(humanMove).not.toHaveProperty('thoughts');
    expect(humanMove).not.toHaveProperty('rejections');
    expect(modelMove.thoughts).toBe('model reasoning');
  });

  it('records LLM rejections into the gallery and ratings aggregates (D5b/D6)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b');
    // p1's first move: one illegal attempt + one transport failure. Transport is
    // infra, not a hallucination — it must neither appear nor count (D5).
    payload.moves[0] = {
      ...payload.moves[0]!,
      rejections: [
        { kind: 'illegal', reason: 'occupied', attempted: '4', raw: '{"cell":4}' },
        { kind: 'transport' },
      ],
    };
    // p2's first move: one unparseable reply.
    payload.moves[1] = {
      ...payload.moves[1]!,
      rejections: [{ kind: 'unparseable', raw: 'let me think' }],
    };

    const res = await submitResult(handle.db, newJti(), payload, '1.2.3.4');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const gallery = await handle.db.select().from(failureGallery).orderBy(asc(failureGallery.id));
    expect(gallery).toHaveLength(2); // transport excluded
    const illegal = gallery.find((g) => g.kind === 'illegal')!;
    expect(illegal.subjectId).toBe('openrouter:a');
    expect(illegal.attempted).toBe('4');
    expect(illegal.reason).toBe('occupied');
    expect(illegal.excerpt).toBe('{"cell":4}');
    expect(illegal.moveIndex).toBe(0);
    const unparseable = gallery.find((g) => g.kind === 'unparseable')!;
    expect(unparseable.subjectId).toBe('openrouter:b');
    expect(unparseable.attempted).toBeNull();

    const rows = await handle.db.select().from(ratings);
    const a = rows.find((r) => r.subjectId === 'openrouter:a')!;
    expect(a.rejectedAttempts).toBe(1); // transport excluded
    expect(a.movesWithRejections).toBe(1);
    expect(a.capturedMoves).toBe(a.totalMoves); // denominator started this match
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

  it('rejects fabricated instant telemetry (no network round trip is 10ms)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 10, 'openrouter:a', 'openrouter:b');
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('suspicious_timing');
  });

  it('ACCEPTS a genuinely fast model — real models answer in ~1s (SPEC §15 said 3s)', async () => {
    // Measured live: gpt-4o-mini ~1.1s/move, llama-3.1-8b ~2.9s/move. The old 3s
    // floor rejected honest model-vs-model matches outright, which meant the model
    // ranking silently accepted only SLOW models.
    const payload = playOut('tictactoe', 'standard', 0, 1100, 'openrouter:a', 'openrouter:b');
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ranked).toBe(true);
      expect(res.ratingChanges).toHaveLength(2);
    }
  });

  // ── Regressions from a REAL run against OpenRouter ────────────────────────
  // llama-3.2-3b:free was rate-limited (429) on every move, forfeited all of
  // them, WON by luck, and scored 100% Precyzja. Both halves of that are bugs.

  it('does not accuse the player of cheating when the PROVIDER failed fast (404/429)', async () => {
    // A dead model id returns 404 in ~300ms → the runner forfeits. Averaging those
    // failures in used to trip the <3s "suspicious_timing" cheat check, rejecting
    // the match and blaming the user for an outage. Observed live.
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:real', 'openrouter:dead');
    payload.moves = payload.moves.map((m) =>
      m.player === 'p2'
        ? { ...m, telemetry: { ...m.telemetry, latencyMs: 300, forfeit: true, retries: 3 } }
        : m,
    );

    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true); // NOT rejected as cheating…
    if (res.ok) {
      expect(res.ranked).toBe(false); // …but honestly excluded from Elo
      expect(res.unrankedReason).toBe('no_real_moves');
    }
  });

  it('does not credit forfeited (random) moves as optimal — Precyzja is decisions only', async () => {
    // p2's every move is a forfeit; some random substitutes land on optimal cells.
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:real', 'openrouter:ghost');
    payload.moves = payload.moves.map((m) =>
      m.player === 'p2' ? { ...m, telemetry: { ...m.telemetry, forfeit: true } } : m,
    );
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true);

    const ghost = (await handle.db.select().from(ratings)).find(
      (r) => r.subjectId === 'openrouter:ghost',
    );
    // Saved without ratings at all (see next test) — nothing to credit.
    expect(ghost).toBeUndefined();
  });

  it('saves a match where a side forfeited EVERY move, but keeps it out of Elo', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:real', 'openrouter:ghost');
    payload.moves = payload.moves.map((m) =>
      m.player === 'p2' ? { ...m, telemetry: { ...m.telemetry, forfeit: true } } : m,
    );

    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ranked).toBe(false);
      expect(res.unrankedReason).toBe('no_real_moves');
      expect(res.ratingChanges).toEqual([]);
    }
    // The match is still replayable…
    expect(await handle.db.select().from(matches)).toHaveLength(1);
    // …but nobody's rating moved — not even the model that actually played.
    expect(await handle.db.select().from(ratings)).toHaveLength(0);
  });

  it('still ranks a match where a model forfeited SOME moves (it did decide sometimes)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b');
    payload.moves[1] = {
      ...payload.moves[1]!,
      telemetry: { ...payload.moves[1]!.telemetry, forfeit: true },
    };
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ranked).toBe(true);
      expect(res.ratingChanges).toHaveLength(2);
    }
    // Precyzja divides by DECIDED moves, so the forfeit is not in the denominator.
    const b = (await handle.db.select().from(ratings)).find((r) => r.subjectId === 'openrouter:b')!;
    expect(b.forfeitMoves).toBe(1);
    expect(b.optimalMoves).toBeLessThanOrEqual(b.totalMoves - b.forfeitMoves);
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

  it('accepts a sudoku match (seed-reconstructed) and moves both ratings', async () => {
    const payload = playSudoku('mini', 3, 'openrouter:deducer', 'openrouter:guesser');
    const res = await submitResult(handle.db, newJti(), payload, '1.2.3.4');
    expect(res.ok).toBe(true);
    if (res.ok) {
      // p1 plays perfectly, p2 guesses → p1 wins, both ratings leave 1000.
      expect(res.winner).toBe('p1');
      expect(res.ratingChanges).toHaveLength(2);
      const p1 = res.ratingChanges.find((r) => r.subjectId === 'openrouter:deducer')!;
      const p2 = res.ratingChanges.find((r) => r.subjectId === 'openrouter:guesser')!;
      expect(p1.after).toBeGreaterThan(1000);
      expect(p2.after).toBeLessThan(1000);
    }
    // §12.2 Precyzja: the perfect deducer scores optimal moves server-side.
    const deducer = (await handle.db.select().from(ratings)).find(
      (r) => r.subjectId === 'openrouter:deducer',
    )!;
    expect(deducer.optimalMoves).toBeGreaterThan(0);
  });

  it('rejects a sudoku match with a rules-inconsistent move (422)', async () => {
    const payload = playSudoku('mini', 4, 'openrouter:a', 'openrouter:b');
    // Corrupt p2's move into the same digit p1 just placed in the same row → clash.
    const first = /r(\d+)c(\d+)=(\d)/.exec(payload.moves[0]!.move as string)!;
    const row = Number(first[1]);
    const otherCol = (Number(first[2]) % 4) + 1;
    payload.moves[1] = { ...payload.moves[1]!, move: `r${row}c${otherCol}=${first[3]}` };
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(422);
  });
});

describe('submitResult — scrabble (needs registered lexicons)', () => {
  beforeEach(() => {
    registerLexicon('pl', miniLexicon('pl', []));
    registerLexicon('en', miniLexicon('en', []));
  });
  afterEach(() => clearLexicons());

  it('accepts a valid scrabble match and records both ratings', async () => {
    const payload = playScrabblePasses(3, 'openrouter:wordy', 'openrouter:silent');
    const res = await submitResult(handle.db, newJti(), payload, '1.2.3.4');
    expect(res.ok).toBe(true);
    if (res.ok) expect(['p1', 'p2', 'draw']).toContain(res.winner);
    // Both subjects get a per-(mode,game,variant) rating row.
    const rows = (await handle.db.select().from(ratings)).filter((r) => r.game === 'scrabble');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.variant === 'pl')).toBe(true);
  });

  it('rejects a scrabble match whose first word does not cover H8 (422)', async () => {
    const payload = playScrabblePasses(5, 'openrouter:a', 'openrouter:b');
    // Replace the first move with an illegal opening placement.
    payload.moves[0] = { ...payload.moves[0]!, move: 'A1>AT' };
    const res = await submitResult(handle.db, newJti(), payload, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe(422);
  });
});

describe('POST /api/result — scrabble 503 until the lexicons load (§8.2)', () => {
  it('refuses a scrabble result with 503 when no lexicon is registered', async () => {
    clearLexicons(); // simulate a server that has not finished loading dictionaries
    const config = loadConfig({ JWT_SECRET: 'test-secret' });
    const app = buildApp({ config, db: handle.db });
    const { token } = await signSession('test-secret', 1800, newJti());
    const payload = playScrabblePassesUnvalidated();

    const res = await app.request('/api/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('lexicon_unavailable');
  });
});

/** A scrabble payload built WITHOUT touching the engine (so no lexicon is needed to construct it). */
function playScrabblePassesUnvalidated(): ResultPayload {
  const tele = { latencyMs: 4000, retries: 0, forfeit: false, promptTokens: 20, completionTokens: 2 };
  return {
    mode: 'model_vs_model',
    game: 'scrabble',
    variant: 'pl',
    p1Id: 'openrouter:a',
    p2Id: 'openrouter:b',
    moves: [
      { player: 'p1', move: 'PASS', telemetry: { ...tele } },
      { player: 'p2', move: 'PASS', telemetry: { ...tele } },
    ],
    setup: { game: 'scrabble', variant: 'pl', seed: 1 },
  };
}

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

  it('GET /api/og/:id renders a PNG for a saved match (§11)', async () => {
    const config = loadConfig({});
    const app = buildApp({ config, db: handle.db });
    const save = await submitResult(
      handle.db,
      newJti(),
      playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b'),
      null,
    );
    const id = save.ok ? save.matchId : '';
    const res = await app.request(`/api/og/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
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

describe('player identity (SPEC §10)', () => {
  it('binds the human side to human:<id> and records matches.player_id', async () => {
    const player = await resolvePlayer(handle.db, 'tok-alice-1234567890');
    const res = await submitResult(handle.db, newJti(), playHuman(1), '1.2.3.4', humanOpts(player));
    expect(res.ok).toBe(true);

    const rated = await handle.db.select({ id: ratings.subjectId }).from(ratings);
    expect(rated.map((r) => r.id)).toContain(`human:${player.id}`);
    expect(rated.map((r) => r.id)).not.toContain('human');

    const m = await handle.db.select({ pid: matches.playerId }).from(matches);
    expect(m[0]!.pid).toBe(player.id);
  });

  it('accumulates every match by the same token into ONE ranking row', async () => {
    const player = await resolvePlayer(handle.db, 'tok-bob-0987654321xyz');
    expect((await submitResult(handle.db, newJti(), playHuman(1), null, humanOpts(player))).ok).toBe(true);
    expect((await submitResult(handle.db, newJti(), playHuman(2), null, humanOpts(player))).ok).toBe(true);

    const rows = await handle.db
      .select()
      .from(ratings)
      .where(eq(ratings.subjectId, `human:${player.id}`));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.games).toBe(2);
  });

  it('keeps two different tokens as two independent players', async () => {
    const a = await resolvePlayer(handle.db, 'tok-carol-111111111111');
    const b = await resolvePlayer(handle.db, 'tok-dave-2222222222222');
    expect(a.id).not.toBe(b.id);
    await submitResult(handle.db, newJti(), playHuman(1), null, humanOpts(a));
    await submitResult(handle.db, newJti(), playHuman(2), null, humanOpts(b));
    const humanRows = await handle.db
      .select({ id: ratings.subjectId })
      .from(ratings)
      .where(sql`${ratings.subjectId} LIKE 'human:%'`);
    expect(humanRows).toHaveLength(2);
  });

  it('falls back to the shared anonymous human row without a token', async () => {
    await submitResult(handle.db, newJti(), playHuman(1), null, humanOpts(null));
    const rows = await handle.db.select({ id: ratings.subjectId }).from(ratings);
    expect(rows.map((r) => r.id)).toContain('human');
  });

  it('resolvePlayer is idempotent for the same token', async () => {
    const first = await resolvePlayer(handle.db, 'tok-eve-33333333333333');
    const again = await resolvePlayer(handle.db, 'tok-eve-33333333333333');
    expect(first.id).toBe(again.id);
    expect(await handle.db.select().from(players)).toHaveLength(1);
  });
});

describe('player profile + human leaderboard (HTTP)', () => {
  const cfg = () => loadConfig({ JWT_SECRET: 'test-secret' });
  const hdr = (token: string) => ({ 'content-type': 'application/json', 'x-player-token': token });

  it('sets, reads and rejects duplicate nicknames', async () => {
    const app = buildApp({ config: cfg(), db: handle.db });
    const set = await app.request('/api/player/nickname', {
      method: 'POST',
      headers: hdr('tok-frank-444444444444'),
      body: JSON.stringify({ nickname: 'Frankie' }),
    });
    expect(set.status).toBe(200);
    expect(((await set.json()) as { nickname: string }).nickname).toBe('frankie');

    const me = await app.request('/api/player/me', { headers: hdr('tok-frank-444444444444') });
    expect(((await me.json()) as { nickname: string }).nickname).toBe('frankie');

    const taken = await app.request('/api/player/nickname', {
      method: 'POST',
      headers: hdr('tok-grace-55555555555'),
      body: JSON.stringify({ nickname: 'Frankie' }),
    });
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as { error: string }).error).toBe('nickname_taken');
  });

  it('issues a match-start token from POST /api/match/start', async () => {
    const app = buildApp({ config: cfg(), db: handle.db });
    const res = await app.request('/api/match/start', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { startToken: string };
    expect(body.startToken.split('.')).toHaveLength(3); // a JWT
  });

  it('rejects a profane nickname (400)', async () => {
    const app = buildApp({ config: cfg(), db: handle.db });
    const res = await app.request('/api/player/nickname', {
      method: 'POST',
      headers: hdr('tok-henry-666666666666'),
      body: JSON.stringify({ nickname: 'kurwa99' }),
    });
    expect(res.status).toBe(400);
  });

  it('shows only named, unflagged players in subject=humans', async () => {
    const app = buildApp({ config: cfg(), db: handle.db });
    const q = 'mode=human_vs_model&game=battleship&variant=small&subject=humans';

    const player = await resolvePlayer(handle.db, 'tok-iris-777777777777');
    await submitResult(handle.db, newJti(), playHuman(1), null, humanOpts(player));

    // No nickname yet → hidden.
    resetLeaderboardCache();
    let board = (await (await app.request(`/api/leaderboard?${q}`)).json()) as unknown[];
    expect(board).toHaveLength(0);

    // Give a nickname → visible, LABELLED by nickname while `subjectId` stays the
    // real ranking key (the UI needs it to look up this player's Elo history).
    await handle.db.update(players).set({ nickname: 'iris' }).where(eq(players.id, player.id));
    resetLeaderboardCache();
    board = (await (await app.request(`/api/leaderboard?${q}`)).json()) as Array<{
      subjectId: string;
      label: string;
    }>;
    expect(board).toHaveLength(1);
    expect((board[0] as { label: string }).label).toBe('iris');
    expect((board[0] as { subjectId: string }).subjectId).toBe(`human:${player.id}`);

    // Flag as suspicious → hidden again.
    await handle.db
      .update(players)
      .set({ flaggedAt: sql`now()` })
      .where(eq(players.id, player.id));
    resetLeaderboardCache();
    board = (await (await app.request(`/api/leaderboard?${q}`)).json()) as unknown[];
    expect(board).toHaveLength(0);
  });
});

/**
 * Regression tests for the code-review findings. Each one, before the fix, was a
 * way to write into the ranking without paying for it — or to break the board.
 */
describe('hardening of POST /api/result (code review)', () => {
  const cfg = () => loadConfig({ JWT_SECRET: 'test-secret' });
  const post = async (body: unknown, extra: Record<string, string> = {}) => {
    const app = buildApp({ config: cfg(), db: handle.db, now: clock });
    const { token } = await signSession('test-secret', 1800, newJti());
    return app.request('/api/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...extra },
      body: JSON.stringify(body),
    });
  };

  it('refuses a client-supplied `human:<uuid>` subject id — the namespace is the server’s', async () => {
    // THE bypass: with `human:<uuid>` in p1Id and no X-Player-Token, the human
    // side went undetected, so start-token, pacing, timing and the daily cap were
    // all skipped — while Elo still landed on that player's ranking row.
    const player = await resolvePlayer(handle.db, 'tok-spoof-1111111111');
    const payload = { ...playHuman(1), p1Id: `human:${player.id}` };

    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('reserved_subject_id');
    expect(await handle.db.select().from(ratings)).toHaveLength(0);
  });

  it('refuses the human marker in a model_vs_model match', async () => {
    const res = await post({ ...playOut('tictactoe', 'standard', 0, 4000, 'human', 'openrouter:b') });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('reserved_subject_id');
  });

  it('rejects a malformed payload with 400 instead of crashing with a 500', async () => {
    // A move with no `telemetry` used to reach `aggregate` and throw a TypeError
    // outside the try block → unhandled 500.
    const res = await post({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:a',
      p2Id: 'openrouter:b',
      moves: [{ player: 'p1', move: 0 }],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('bad_payload');
  });

  it('rejects non-numeric telemetry (it would poison the ranking aggregates)', async () => {
    const payload = playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b');
    const broken = {
      ...payload,
      moves: payload.moves.map((m, i) =>
        i === 0 ? { ...m, telemetry: { ...m.telemetry, latencyMs: 'szybko' } } : m,
      ),
    };
    expect((await post(broken)).status).toBe(400);
  });

  it('serves the human board even when a malformed human:* row exists', async () => {
    // Defence in depth: such a row can no longer be created, but if one ever
    // existed the `::uuid` cast would 500 the entire board.
    await handle.db.insert(ratings).values({
      subjectId: 'human:not-a-uuid',
      mode: 'human_vs_model',
      game: 'battleship',
      variant: 'small',
    });
    const app = buildApp({ config: cfg(), db: handle.db });
    resetLeaderboardCache();
    const res = await app.request(
      '/api/leaderboard?mode=human_vs_model&game=battleship&variant=small&subject=humans',
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toHaveLength(0);
  });

  it('rejects a start token minted for a different identity', async () => {
    // Start tokens are bound to the identity that asked for them, so they cannot
    // be minted anonymously (or under a throwaway), aged, then spent by the
    // identity actually being farmed.
    const app = buildApp({ config: cfg(), db: handle.db, now: clock });
    const anon = await app.request('/api/match/start', { method: 'POST' });
    const { startToken } = (await anon.json()) as { startToken: string };

    const res = await post({ ...playHuman(2), startToken }, { 'x-player-token': 'tok-bind-22222222222222' });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe('start_token_mismatch');
  });

  it('GET /api/player/me does not create a player row', async () => {
    const app = buildApp({ config: cfg(), db: handle.db });
    const res = await app.request('/api/player/me', {
      headers: { 'x-player-token': 'tok-readonly-99999999' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: null, nickname: null, flagged: false });
    expect(await handle.db.select().from(players)).toHaveLength(0);
  });

  it('does not count model_vs_model matches against the per-IP human cap', async () => {
    // Everyone behind one NAT used to share a 60/day budget for the app's main flow.
    await handle.db.insert(matches).values(
      Array.from({ length: 60 }, (_, i) => ({
        mode: 'model_vs_model',
        game: 'tictactoe',
        variant: 'standard',
        p1Id: 'openrouter:a',
        p2Id: 'openrouter:b',
        winner: 'p1',
        moves: [],
        movesHash: `mvm-${i}`,
        lab: false,
        clientIp: '5.5.5.5',
      })),
    );
    const player = await resolvePlayer(handle.db, 'tok-nat-33333333333');
    const res = await submitResult(handle.db, newJti(), playHuman(6), '5.5.5.5', humanOpts(player));
    expect(res.ok).toBe(true);
  });
});

describe('anti-bot pacing for ranked human matches (SPEC §15.3)', () => {
  it('refuses a ranked human match with no start token', async () => {
    const player = await resolvePlayer(handle.db, 'tok-pacing-1111111111');
    const res = await submitResult(handle.db, newJti(), playHuman(1), null, {
      player,
      start: null,
      now: clock,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe(422);
      expect(res.reason).toBe('missing_start_token');
    }
  });

  it('refuses a match played faster than a person could play it', async () => {
    const player = await resolvePlayer(handle.db, 'tok-pacing-2222222222');
    // Started 1 second ago, but the payload claims a whole battleship game.
    const res = await submitResult(handle.db, newJti(), playHuman(1), null, humanOpts(player, 1000));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('too_fast_for_human');
  });

  it('accepts the same match once enough real time has passed', async () => {
    const player = await resolvePlayer(handle.db, 'tok-pacing-3333333333');
    const res = await submitResult(
      handle.db,
      newJti(),
      playHuman(1),
      null,
      humanOpts(player, 20 * 60_000),
    );
    expect(res.ok).toBe(true);
  });

  it('burns the start token — one start, one saved match', async () => {
    const player = await resolvePlayer(handle.db, 'tok-pacing-4444444444');
    const start = startedAgo(20 * 60_000);
    const first = await submitResult(handle.db, newJti(), playHuman(1), null, {
      player,
      start,
      now: clock,
    });
    expect(first.ok).toBe(true);

    const replayed = await submitResult(handle.db, newJti(), playHuman(2), null, {
      player,
      start, // same start token
      now: clock,
    });
    expect(replayed.ok).toBe(false);
    if (!replayed.ok) {
      expect(replayed.code).toBe(409);
      expect(replayed.reason).toBe('start_token_used');
    }
  });

  it('rejects metronomic human move times (a script, not a person)', async () => {
    const player = await resolvePlayer(handle.db, 'tok-pacing-5555555555');
    const payload = playHuman(1);
    // Every human move takes exactly the same time — no person does that.
    payload.moves = payload.moves.map((m) =>
      m.player === 'p1' ? { ...m, telemetry: { ...m.telemetry, latencyMs: 2000 } } : m,
    );
    const res = await submitResult(handle.db, newJti(), payload, null, humanOpts(player));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('suspicious_timing');
  });

  it('rejects instant human moves (<800ms average)', async () => {
    const player = await resolvePlayer(handle.db, 'tok-pacing-6666666666');
    const payload = playHuman(1);
    let i = 0;
    payload.moves = payload.moves.map((m) =>
      m.player === 'p1'
        ? { ...m, telemetry: { ...m.telemetry, latencyMs: 100 + (i++ % 50) } }
        : m,
    );
    const res = await submitResult(handle.db, newJti(), payload, null, humanOpts(player));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('suspicious_timing');
  });

  it('leaves model_vs_model matches alone (no start token needed)', async () => {
    const res = await submitResult(
      handle.db,
      newJti(),
      playOut('tictactoe', 'standard', 0, 4000, 'openrouter:a', 'openrouter:b'),
      null,
      { now: clock },
    );
    expect(res.ok).toBe(true);
  });

  it('exempts lab human matches — they never rank', async () => {
    const payload = { ...playHuman(3), lab: true };
    const res = await submitResult(handle.db, newJti(), payload, null, { start: null, now: clock });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.lab).toBe(true);
  });

  it('accepts a real start token minted by /api/match/start', async () => {
    const { jti } = await signStartToken('test-secret', 2700);
    const player = await resolvePlayer(handle.db, 'tok-pacing-7777777777');
    // Token freshly minted → too fast; the same jti aged out → accepted.
    const res = await submitResult(handle.db, newJti(), playHuman(4), null, {
      player,
      start: { jti, iat: Math.floor((NOW - 20 * 60_000) / 1000) },
      now: clock,
    });
    expect(res.ok).toBe(true);
  });
});

/** Seed N ranked matches saved "today" for a player / IP, bypassing submitResult. */
async function seedRankedToday(
  n: number,
  by: { playerId?: string; clientIp?: string },
): Promise<void> {
  await handle.db.insert(matches).values(
    Array.from({ length: n }, (_, i) => ({
      mode: 'human_vs_model',
      game: 'battleship',
      variant: 'small',
      p1Id: 'human',
      p2Id: 'openrouter:opp',
      winner: 'p1',
      moves: [],
      movesHash: `seed-${by.playerId ?? by.clientIp}-${i}`,
      lab: false,
      playerId: by.playerId ?? null,
      clientIp: by.clientIp ?? null,
    })),
  );
}

describe('daily ranked caps + precision flag (SPEC §15.3)', () => {
  it('stops one identity after 30 ranked matches in a day', async () => {
    const player = await resolvePlayer(handle.db, 'tok-limit-11111111111');
    await seedRankedToday(30, { playerId: player.id });

    const res = await submitResult(handle.db, newJti(), playHuman(9), null, humanOpts(player));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe(429);
      expect(res.reason).toBe('daily_limit');
    }
  });

  it('still accepts the 30th match — the cap is a ceiling, not a fence', async () => {
    const player = await resolvePlayer(handle.db, 'tok-limit-22222222222');
    await seedRankedToday(29, { playerId: player.id });
    const res = await submitResult(handle.db, newJti(), playHuman(9), null, humanOpts(player));
    expect(res.ok).toBe(true);
  });

  it('stops one machine minting identities after 60 ranked matches from an IP', async () => {
    const player = await resolvePlayer(handle.db, 'tok-limit-33333333333');
    await seedRankedToday(60, { clientIp: '9.9.9.9' });

    const res = await submitResult(handle.db, newJti(), playHuman(9), '9.9.9.9', humanOpts(player));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe(429);
      expect(res.reason).toBe('daily_limit_ip');
    }
  });

  it('does not count lab matches against the cap', async () => {
    const player = await resolvePlayer(handle.db, 'tok-limit-44444444444');
    await handle.db.insert(matches).values(
      Array.from({ length: 40 }, (_, i) => ({
        mode: 'human_vs_model',
        game: 'battleship',
        variant: 'small',
        p1Id: 'human',
        p2Id: 'openrouter:opp',
        winner: 'p1',
        moves: [],
        movesHash: `lab-${i}`,
        lab: true, // lab matches never rank, so they never consume the cap
        playerId: player.id,
      })),
    );
    const res = await submitResult(handle.db, newJti(), playHuman(9), null, humanOpts(player));
    expect(res.ok).toBe(true);
  });

  it('flags solver-like battleship precision and hides the player from the board', async () => {
    const player = await resolvePlayer(handle.db, 'tok-flag-5555555555');
    await handle.db.update(players).set({ nickname: 'suspect' }).where(eq(players.id, player.id));
    await submitResult(handle.db, newJti(), playHuman(11), null, humanOpts(player));

    // Force the aggregate past the threshold. It has to be big enough that the
    // next match's own moves cannot dilute it back under 0.9, because the flag
    // is evaluated after this match is folded into the running totals.
    const subjectId = `human:${player.id}`;
    await handle.db
      .update(ratings)
      .set({ totalMoves: 1000, optimalMoves: 990 })
      .where(eq(ratings.subjectId, subjectId));

    // The next ranked battleship match re-checks the aggregate and flags.
    await submitResult(handle.db, newJti(), playHuman(12), null, humanOpts(player));

    const [row] = await handle.db
      .select({ flaggedAt: players.flaggedAt })
      .from(players)
      .where(eq(players.id, player.id));
    expect(row!.flaggedAt).not.toBeNull();

    const app = buildApp({ config: loadConfig({}), db: handle.db });
    resetLeaderboardCache();
    const board = (await (
      await app.request(
        '/api/leaderboard?mode=human_vs_model&game=battleship&variant=small&subject=humans',
      )
    ).json()) as unknown[];
    expect(board).toHaveLength(0);
  });

  it('flags a solver that spread its games across battleship variants', async () => {
    // Per-variant thresholds let a solver stay under 100 moves in every single
    // row; the check now sums across all variants of the game.
    const player = await resolvePlayer(handle.db, 'tok-flag-7777777777');
    await handle.db.update(players).set({ nickname: 'spread' }).where(eq(players.id, player.id));
    await submitResult(handle.db, newJti(), playHuman(13), null, humanOpts(player));

    const subjectId = `human:${player.id}`;
    // 3 variants × 400 moves, 98% optimal — no single row reaches the old bar
    // on its own once you imagine it split, but together it is plainly a solver.
    await handle.db
      .update(ratings)
      .set({ totalMoves: 400, optimalMoves: 396 })
      .where(eq(ratings.subjectId, subjectId));
    for (const variant of ['medium', 'large']) {
      await handle.db.insert(ratings).values({
        subjectId,
        mode: 'human_vs_model',
        game: 'battleship',
        variant,
        totalMoves: 400,
        optimalMoves: 396,
      });
    }

    await submitResult(handle.db, newJti(), playHuman(14), null, humanOpts(player));

    const [row] = await handle.db
      .select({ flaggedAt: players.flaggedAt })
      .from(players)
      .where(eq(players.id, player.id));
    expect(row!.flaggedAt).not.toBeNull();
  });

  it('never flags precision in tictactoe — perfect play there is human', async () => {
    const player = await resolvePlayer(handle.db, 'tok-flag-6666666666');
    const ttt: ResultPayload = {
      ...playOut('tictactoe', 'standard', 0, 4000, 'human', 'openrouter:opp'),
      mode: 'human_vs_model',
    };
    let i = 0;
    ttt.moves = ttt.moves.map((m) =>
      m.player === 'p1'
        ? { ...m, telemetry: { ...m.telemetry, latencyMs: 1500 + ((i++ * 373) % 2500) } }
        : m,
    );
    await submitResult(handle.db, newJti(), ttt, null, humanOpts(player));

    await handle.db
      .update(ratings)
      .set({ totalMoves: 200, optimalMoves: 200 }) // flawless, but that is normal in tictactoe
      .where(eq(ratings.subjectId, `human:${player.id}`));

    const ttt2: ResultPayload = {
      ...playOut('tictactoe', 'standard', 0, 4000, 'human', 'openrouter:opp2'),
      mode: 'human_vs_model',
    };
    let j = 0;
    ttt2.moves = ttt2.moves.map((m) =>
      m.player === 'p1'
        ? { ...m, telemetry: { ...m.telemetry, latencyMs: 1400 + ((j++ * 411) % 2200) } }
        : m,
    );
    await submitResult(handle.db, newJti(), ttt2, null, humanOpts(player));

    const [row] = await handle.db
      .select({ flaggedAt: players.flaggedAt })
      .from(players)
      .where(eq(players.id, player.id));
    expect(row!.flaggedAt).toBeNull();
  });
});
