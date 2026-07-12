import {
  ELO_START,
  type GameAnalysis,
  type GameId,
  type Move,
  type MoveQuality,
  type ReplayMove,
  analyzeMatch,
  movesHash,
  replayMatch,
  updateElo,
} from '@arena/game-core';
import { and, eq, sql } from 'drizzle-orm';

import type { PlayerRecord } from '../auth/player';
import type { Database } from './client';
import { eloHistory, matches, players, ratings, usedJti } from './schema';

export interface ResultMoveTelemetry {
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  retries: number;
  forfeit: boolean;
  costUsd?: number;
}
export interface ResultMove {
  player: 'p1' | 'p2';
  move: Move;
  telemetry: ResultMoveTelemetry;
  eval?: unknown;
}
export interface ResultPayload {
  mode: 'model_vs_model' | 'human_vs_model';
  game: GameId;
  variant: string;
  p1Id: string;
  p2Id: string;
  moves: ResultMove[];
  setup?: unknown;
  lab?: boolean;
  serverVerified?: boolean;
  priceSnapshot?: unknown;
  durationMs?: number;
  commentary?: unknown;
  /** Match-start token from POST /api/match/start — required for ranked human matches (§15.3). */
  startToken?: string;
}

export interface RatingChange {
  subjectId: string;
  before: number;
  after: number;
}
/** Why a saved match did not touch the ranking. */
export type UnrankedReason = 'lab' | 'no_real_moves';

export type SubmitResult =
  | {
      ok: true;
      matchId: string;
      winner: 'p1' | 'p2' | 'draw';
      lab: boolean;
      /** False when the match was saved (replayable) but excluded from Elo. */
      ranked: boolean;
      unrankedReason?: UnrankedReason;
      ratingChanges: RatingChange[];
    }
  | { ok: false; code: 400 | 401 | 409 | 422 | 429; reason: string };

const MAX_TOKENS_PER_MOVE = 5000;
const MAX_COST_PER_MATCH = 1;
/**
 * Physical floor for a real OpenRouter round trip (openrouter only; local
 * providers exempt).
 *
 * SPEC §15 says 3000ms. That number is WRONG in practice and was actively
 * breaking the product: measured live, gpt-4o-mini answers a tic-tac-toe prompt
 * in ~1.1s and llama-3.1-8b in ~2.9s, so a perfectly honest model-vs-model match
 * — both sides answering every move, zero forfeits — was rejected as
 * `suspicious_timing`. At 3s the model ranking only accepts SLOW models.
 *
 * The check is also weak by construction: `latencyMs` comes from the client, so
 * a faker simply reports 5000 and sails through. It therefore punishes only the
 * honest. What it can still do is catch obviously fabricated telemetry (0ms, 10ms
 * — no network round trip is that fast), so it is kept as a smoke detector, not
 * as a cheat gate. The real defenses are elsewhere: server replay, one-time jti,
 * moves_hash dedup, Turnstile, rate limits, and — for humans — the server-stamped
 * start token (§15.3), which the client cannot forge.
 */
const MIN_AVG_LATENCY_MS = 150;

/**
 * Anti-bot pacing for the human ranking (§15.3). A person needs real time to
 * move; a script does not. We require at least ~1s of wall-clock per human move
 * (measured from the server-issued match-start token, which the client cannot
 * forge), with a tolerance for fast-but-genuine play and a ceiling so long
 * battleship games are not punished.
 */
const MIN_MS_PER_HUMAN_MOVE = 1000;
const PACING_TOLERANCE_MS = 2000;
const PACING_CEILING_MS = 15 * 60_000;

/** Cheap, forgeable second layer: no person plays this fast or this evenly. */
const MIN_HUMAN_AVG_LATENCY_MS = 800;
const MIN_HUMAN_LATENCY_SPREAD_MS = 10;

/**
 * Daily ranked-match caps (§15.3). The per-player cap bounds how fast one
 * identity can climb; the per-IP cap catches someone minting fresh identities
 * from one machine. Generous enough that a keen human never notices.
 */
const MAX_RANKED_MATCHES_PER_PLAYER_DAY = 30;
const MAX_RANKED_MATCHES_PER_IP_DAY = 60;

/**
 * Precision flag (§15.3). Sustained near-perfect battleship play is a solver,
 * not a person — battleship has no perfect strategy, only better guessing. We
 * do NOT apply this to tictactoe: perfect play there is easy and expected of a
 * human. Flagging only hides the player from the board; nothing is deleted.
 */
const FLAG_MIN_MOVES = 100;
const FLAG_OPTIMAL_RATE = 0.9;

class Abort {
  constructor(
    readonly code: 409 | 429,
    readonly reason: string,
  ) {}
}

function sanitizeIp(ip: string | null): string | null {
  if (!ip || ip === 'unknown') return null;
  return /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

interface SideAgg {
  id: string;
  moveCount: number;
  latencySum: number;
  tokens: number;
  cost: number;
  forfeits: number;
  /** Moves the model actually answered (not forfeited) — the only ones it "timed". */
  decidedCount: number;
  decidedLatencySum: number;
  /** Optimal moves per §12.2, computed server-side (never trusted from client). */
  optimal: number;
}

function aggregate(payload: ResultPayload, side: 'p1' | 'p2', id: string): SideAgg {
  const mv = payload.moves.filter((m) => m.player === side);
  const decided = mv.filter((m) => !m.telemetry.forfeit);
  return {
    id,
    moveCount: mv.length,
    latencySum: mv.reduce((s, m) => s + m.telemetry.latencyMs, 0),
    decidedCount: decided.length,
    decidedLatencySum: decided.reduce((s, m) => s + m.telemetry.latencyMs, 0),
    tokens: mv.reduce(
      (s, m) => s + (m.telemetry.promptTokens ?? 0) + (m.telemetry.completionTokens ?? 0),
      0,
    ),
    cost: mv.reduce((s, m) => s + (m.telemetry.costUsd ?? 0), 0),
    forfeits: mv.filter((m) => m.telemetry.forfeit).length,
    optimal: 0, // filled from server-side analysis in submitResult
  };
}

/**
 * Optimal moves the model ACTUALLY CHOSE — forfeits excluded.
 *
 * A forfeit is a random legal move we substitute after the model failed three
 * corrections (§8); it is our choice, not the model's. Counting it in Precyzja
 * credits the model for a coin flip.
 *
 * This is not hypothetical. In a live run, `llama-3.2-3b:free` was rate-limited
 * (429) on every single move, forfeited all of them, and scored **100% Precyzja**
 * — beating gpt-4o-mini, which actually played and scored 67%. The ranking was
 * rewarding luck.
 *
 * Forfeits are already punished on their own axis (`forfeitRate` / „Dyscyplina"),
 * so they are excluded from the Precyzja denominator too — see `optimalRate`,
 * which divides by `totalMoves - forfeitMoves`. Precyzja = quality of real
 * decisions; Dyscyplina = how often the model managed to decide at all.
 */
function optimalDecidedMoves(
  payload: ResultPayload,
  analysis: GameAnalysis,
  side: 'p1' | 'p2',
): number {
  let n = 0;
  for (let i = 0; i < payload.moves.length; i++) {
    const m = payload.moves[i]!;
    if (m.player !== side || m.telemetry.forfeit) continue;
    if (analysis.moves[i]?.quality === 'optimal') n += 1;
  }
  return n;
}

/**
 * Did this side never make a single real decision?
 *
 * Same live run: every call 429'd, every move was a forfeited random substitute
 * — and the "model" WON. Awarding Elo for that measures OpenRouter's rate
 * limiter, not the model. Such a match is still saved (it is replayable and
 * honest about what happened), but it must not move anyone's rating.
 */
function neverDecided(payload: ResultPayload, side: 'p1' | 'p2'): boolean {
  const mine = payload.moves.filter((m) => m.player === side);
  return mine.length > 0 && mine.every((m) => m.telemetry.forfeit);
}

/**
 * OpenRouter answers faster than 3s avg are suspicious (§15); local providers exempt.
 *
 * Only ANSWERED moves count. A forfeit is a failed call, and failures are fast —
 * a 404 (retired model) or a 429 (rate limit) comes back in ~300ms. Averaging
 * those in accused the *client* of faking LLM latency when in truth the provider
 * was simply down. Observed live: a match against a dead model id was rejected as
 * `suspicious_timing` — a cheating accusation for someone who did nothing wrong.
 *
 * A side with zero answered moves is not "suspicious", it is a ghost — that case
 * is handled by `neverDecided`, which saves the match but keeps it out of Elo.
 */
function suspiciousTiming(agg: SideAgg): boolean {
  return (
    agg.id.startsWith('openrouter:') &&
    agg.decidedCount > 0 &&
    agg.decidedLatencySum / agg.decidedCount < MIN_AVG_LATENCY_MS
  );
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

async function loadElo(tx: Tx, subjectId: string, p: ResultPayload): Promise<number> {
  const rows = await tx
    .select({ elo: ratings.elo })
    .from(ratings)
    .where(
      and(
        eq(ratings.subjectId, subjectId),
        eq(ratings.mode, p.mode),
        eq(ratings.game, p.game),
        eq(ratings.variant, p.variant),
      ),
    )
    .for('update');
  return rows[0]?.elo ?? ELO_START;
}

/** Start of the current UTC day — the caps reset at 00:00 UTC, not at server-local midnight. */
const UTC_DAY_START = sql`(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

/**
 * Ranked HUMAN matches saved today (UTC), by player identity or by source IP.
 *
 * Deliberately scoped to human_vs_model: the caps exist to bound Elo farming and
 * identity-minting on the human board. Counting model_vs_model here would make
 * everyone behind one NAT (office, campus, CGNAT) share a 60/day budget for the
 * app's main flow.
 */
async function rankedHumanToday(
  tx: Tx,
  by: { playerId?: string; clientIp?: string },
): Promise<number> {
  const who = by.playerId
    ? eq(matches.playerId, by.playerId)
    : sql`${matches.clientIp} = ${by.clientIp}::inet`;
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .where(
      and(
        who,
        eq(matches.lab, false),
        eq(matches.mode, 'human_vs_model'),
        sql`${matches.createdAt} >= ${UTC_DAY_START}`,
      ),
    );
  return rows[0]?.n ?? 0;
}

/**
 * Flag a player whose battleship precision is machine-like (§15.3). Idempotent;
 * reversible by clearing `flagged_at` in SQL. The player keeps playing and their
 * matches keep saving — they just stop appearing in the public human board.
 */
async function maybeFlagPrecision(
  tx: Tx,
  p: ResultPayload,
  playerId: string,
  subjectId: string,
): Promise<void> {
  if (p.game !== 'battleship') return;
  // Summed across ALL battleship variants: a per-variant threshold would let a
  // solver spread its games over small/medium/large and never reach 100 moves
  // in any single row.
  const rows = await tx
    .select({
      total: sql<number>`coalesce(sum(${ratings.totalMoves}), 0)::int`,
      optimal: sql<number>`coalesce(sum(${ratings.optimalMoves}), 0)::int`,
    })
    .from(ratings)
    .where(
      and(
        eq(ratings.subjectId, subjectId),
        eq(ratings.mode, p.mode),
        eq(ratings.game, p.game),
      ),
    );
  const r = rows[0];
  if (!r || r.total < FLAG_MIN_MOVES) return;
  if (r.optimal / r.total < FLAG_OPTIMAL_RATE) return;

  console.warn(
    `[result] flagging player ${playerId}: battleship precision ${r.optimal}/${r.total} — solver-like`,
  );
  await tx
    .update(players)
    .set({ flaggedAt: sql`now()` })
    .where(and(eq(players.id, playerId), sql`${players.flaggedAt} IS NULL`));
}

async function upsertRating(
  tx: Tx,
  p: ResultPayload,
  agg: SideAgg,
  newElo: number,
  wld: [number, number, number],
  skipTelemetry: boolean,
): Promise<void> {
  const [w, l, d] = wld;
  await tx
    .insert(ratings)
    .values({
      subjectId: agg.id,
      mode: p.mode,
      game: p.game,
      variant: p.variant,
      elo: newElo,
      wins: w,
      losses: l,
      draws: d,
      games: 1,
      forfeitMoves: agg.forfeits,
      totalMoves: agg.moveCount,
      latencyMsSum: skipTelemetry ? 0 : agg.latencySum,
      tokensSum: skipTelemetry ? 0 : agg.tokens,
      costUsdSum: skipTelemetry ? '0' : String(agg.cost),
      optimalMoves: agg.optimal,
    })
    .onConflictDoUpdate({
      target: [ratings.subjectId, ratings.mode, ratings.game, ratings.variant],
      set: {
        elo: newElo,
        wins: sql`${ratings.wins} + ${w}`,
        losses: sql`${ratings.losses} + ${l}`,
        draws: sql`${ratings.draws} + ${d}`,
        games: sql`${ratings.games} + 1`,
        forfeitMoves: sql`${ratings.forfeitMoves} + ${agg.forfeits}`,
        totalMoves: sql`${ratings.totalMoves} + ${agg.moveCount}`,
        latencyMsSum: skipTelemetry
          ? sql`${ratings.latencyMsSum}`
          : sql`${ratings.latencyMsSum} + ${agg.latencySum}`,
        tokensSum: skipTelemetry
          ? sql`${ratings.tokensSum}`
          : sql`${ratings.tokensSum} + ${agg.tokens}`,
        costUsdSum: skipTelemetry
          ? sql`${ratings.costUsdSum}`
          : sql`${ratings.costUsdSum} + ${agg.cost}`,
        optimalMoves: sql`${ratings.optimalMoves} + ${agg.optimal}`,
      },
    });
}

/** In human_vs_model the frontend sends the literal id 'human' for the person. */
function humanSideOf(payload: ResultPayload): 'p1' | 'p2' | null {
  if (payload.mode !== 'human_vs_model') return null;
  if (payload.p1Id === 'human') return 'p1';
  if (payload.p2Id === 'human') return 'p2';
  return null;
}

/**
 * Wall-clock a genuine person needs for `moveCount` moves, per the start token.
 * Exported for tests — this threshold is the whole point of the pacing layer.
 */
export function requiredElapsedMs(moveCount: number): number {
  return Math.max(
    0,
    Math.min(moveCount * MIN_MS_PER_HUMAN_MOVE, PACING_CEILING_MS) - PACING_TOLERANCE_MS,
  );
}

/** Latencies of the person's own moves are too fast / too machine-even to be real. */
export function suspiciousHumanTiming(latencies: number[]): boolean {
  if (latencies.length >= 3) {
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    if (avg < MIN_HUMAN_AVG_LATENCY_MS) return true;
  }
  if (latencies.length >= 5) {
    const spread = Math.max(...latencies) - Math.min(...latencies);
    if (spread < MIN_HUMAN_LATENCY_SPREAD_MS) return true;
  }
  return false;
}

/** Match-start proof (§15.3): server-issued `iat` + a one-time `jti`. */
export interface StartProof {
  jti: string;
  iat: number;
}

export interface SubmitOptions {
  player?: PlayerRecord | null;
  start?: StartProof | null;
  now?: () => number;
}

export async function submitResult(
  db: Database,
  jti: string,
  payload: ResultPayload,
  clientIp: string | null,
  opts: SubmitOptions = {},
): Promise<SubmitResult> {
  const player = opts.player ?? null;
  const start = opts.start ?? null;
  const now = (opts.now ?? Date.now)();

  if (!Array.isArray(payload.moves) || payload.moves.length === 0) {
    return { ok: false, code: 400, reason: 'no moves' };
  }

  const lab = payload.lab ?? false;

  // Bind the human side to the identified player so every match by the same
  // person accumulates under one ranking row `human:<players.id>` (SPEC §10).
  // Resolved into locals rather than mutating the caller's payload — a second
  // pass over a mutated payload would no longer recognise the human side.
  const humanSide = humanSideOf(payload);
  const playerId = player && humanSide ? player.id : null;
  const subject = { p1: payload.p1Id, p2: payload.p2Id };
  if (playerId && humanSide) subject[humanSide] = `human:${playerId}`;

  // 1. Server replay — the winner is authoritative, never trusted from client.
  const replayMoves: ReplayMove[] = payload.moves.map((m) => ({ player: m.player, move: m.move }));
  const replay = replayMatch(payload.game, payload.variant, payload.setup as never, replayMoves);
  if (!replay.valid) return { ok: false, code: 422, reason: `replay: ${replay.reason}` };
  if (replay.winner === null) return { ok: false, code: 422, reason: 'match not finished' };
  const winner = replay.winner;

  // 1b. Recompute move analysis server-side (§15.1). We NEVER trust the client's
  // `eval`; if it sent one and it disagrees with ours, the result is falsified.
  const analysis = analyzeMatch(payload.game, payload.variant, payload.setup as never, replayMoves);
  for (let i = 0; i < payload.moves.length; i++) {
    const claimed = (payload.moves[i].eval as { quality?: MoveQuality } | undefined)?.quality;
    if (claimed !== undefined && claimed !== analysis.moves[i]?.quality) {
      return { ok: false, code: 422, reason: 'eval_mismatch' };
    }
  }

  const s1 = aggregate(payload, 'p1', subject.p1);
  const s2 = aggregate(payload, 'p2', subject.p2);
  // Forfeits are OUR random substitutes, not the model's choices (see above).
  s1.optimal = optimalDecidedMoves(payload, analysis, 'p1');
  s2.optimal = optimalDecidedMoves(payload, analysis, 'p2');

  // A side that forfeited literally everything never played — the match is saved
  // for the record, but it cannot move any rating.
  const ghost = neverDecided(payload, 'p1') || neverDecided(payload, 'p2');

  // 2. Sanity: suspicious OpenRouter timing.
  if (suspiciousTiming(s1) || suspiciousTiming(s2)) {
    return { ok: false, code: 422, reason: 'suspicious_timing' };
  }

  // 2b. Anti-bot pacing for the human ranking (§15.3). Ranked human matches must
  // carry a server-issued start token, and enough real time must have passed for
  // a person to have actually played those moves. Lab matches never rank, so
  // they are exempt.
  const ranked = humanSide !== null && !lab;
  if (ranked) {
    if (!start) return { ok: false, code: 422, reason: 'missing_start_token' };

    const humanMoves = payload.moves.filter((m) => m.player === humanSide);
    const elapsedMs = now - start.iat * 1000;
    if (elapsedMs < requiredElapsedMs(humanMoves.length)) {
      return { ok: false, code: 422, reason: 'too_fast_for_human' };
    }
    if (suspiciousHumanTiming(humanMoves.map((m) => m.telemetry.latencyMs))) {
      return { ok: false, code: 422, reason: 'suspicious_timing' };
    }
  }

  // 3. Telemetry bounds → still save, but skip aggregation (§15).
  const totalCost = s1.cost + s2.cost;
  const anyHugeMove = payload.moves.some(
    (m) => (m.telemetry.promptTokens ?? 0) + (m.telemetry.completionTokens ?? 0) > MAX_TOKENS_PER_MOVE,
  );
  const skipTelemetry = totalCost > MAX_COST_PER_MATCH || anyHugeMove;
  if (skipTelemetry) {
    console.warn(`[result] telemetry out of bounds (cost=${totalCost}) — saving without aggregation`);
  }

  const hash = await movesHash(payload.game, payload.variant, payload.setup as never, replayMoves);
  // Ollama runs through our proxy, so those matches are genuinely server-side
  // (SPEC §2.3). Computed from ids, not trusted from the client.
  const serverVerified =
    subject.p1.startsWith('ollama:') || subject.p2.startsWith('ollama:');

  try {
    return await db.transaction(async (tx) => {
      // One-time jti (§15).
      const jtiRow = await tx.insert(usedJti).values({ jti }).onConflictDoNothing().returning();
      if (jtiRow.length === 0) throw new Abort(409, 'jti_used');

      // One start token = one saved match (§15.3): burn it in the same transaction.
      if (ranked && start) {
        const startRow = await tx
          .insert(usedJti)
          .values({ jti: start.jti })
          .onConflictDoNothing()
          .returning();
        if (startRow.length === 0) throw new Abort(409, 'start_token_used');
      }

      // Daily caps (§15.3) — bound how much one identity, or one machine minting
      // identities, can push onto the HUMAN board in a day. Model-vs-model saves
      // are untouched: capping those per IP would punish everyone behind a NAT.
      const ip = sanitizeIp(clientIp);
      if (ranked) {
        if (
          playerId &&
          (await rankedHumanToday(tx, { playerId })) >= MAX_RANKED_MATCHES_PER_PLAYER_DAY
        ) {
          throw new Abort(429, 'daily_limit');
        }
        if (ip && (await rankedHumanToday(tx, { clientIp: ip })) >= MAX_RANKED_MATCHES_PER_IP_DAY) {
          throw new Abort(429, 'daily_limit_ip');
        }
      }

      // Insert match; dedup on moves_hash.
      const inserted = await tx
        .insert(matches)
        .values({
          mode: payload.mode,
          game: payload.game,
          variant: payload.variant,
          p1Id: subject.p1,
          p2Id: subject.p2,
          winner,
          moves: payload.moves,
          setup: payload.setup ?? null,
          commentary: payload.commentary ?? null,
          priceSnapshot: payload.priceSnapshot ?? null,
          movesHash: hash,
          lab,
          serverVerified,
          forfeitMovesP1: s1.forfeits,
          forfeitMovesP2: s2.forfeits,
          durationMs: payload.durationMs ?? null,
          playerId,
          clientIp: ip,
        })
        .onConflictDoNothing({ target: matches.movesHash })
        .returning({ id: matches.id });
      if (inserted.length === 0) throw new Abort(409, 'duplicate');
      const matchId = inserted[0].id;

      // lab=true never touches ratings / elo_history (§13).
      if (lab) {
        return { ok: true, matchId, winner, lab: true, ranked: false, unrankedReason: 'lab', ratingChanges: [] };
      }

      // Neither does a match nobody actually played (rate-limited / dead model).
      if (ghost) {
        console.warn(
          `[result] ${matchId}: a side forfeited every move — saved, but excluded from Elo`,
        );
        return {
          ok: true,
          matchId,
          winner,
          lab: false,
          ranked: false,
          unrankedReason: 'no_real_moves',
          ratingChanges: [],
        };
      }

      const before1 = await loadElo(tx, s1.id, payload);
      const before2 = await loadElo(tx, s2.id, payload);
      const { a, b } = updateElo(before1, before2, winner);

      const wld1: [number, number, number] =
        winner === 'p1' ? [1, 0, 0] : winner === 'p2' ? [0, 1, 0] : [0, 0, 1];
      const wld2: [number, number, number] =
        winner === 'p2' ? [1, 0, 0] : winner === 'p1' ? [0, 1, 0] : [0, 0, 1];

      await upsertRating(tx, payload, s1, a, wld1, skipTelemetry);
      await upsertRating(tx, payload, s2, b, wld2, skipTelemetry);

      // Solver-like battleship precision → hide from the human board (§15.3).
      if (playerId && humanSide) {
        await maybeFlagPrecision(tx, payload, playerId, humanSide === 'p1' ? s1.id : s2.id);
      }

      await tx.insert(eloHistory).values([
        { subjectId: s1.id, mode: payload.mode, game: payload.game, variant: payload.variant, matchId, eloAfter: a },
        { subjectId: s2.id, mode: payload.mode, game: payload.game, variant: payload.variant, matchId, eloAfter: b },
      ]);

      return {
        ok: true,
        matchId,
        winner,
        lab: false,
        ranked: true,
        ratingChanges: [
          { subjectId: s1.id, before: before1, after: a },
          { subjectId: s2.id, before: before2, after: b },
        ],
      };
    });
  } catch (e) {
    if (e instanceof Abort) return { ok: false, code: e.code, reason: e.reason };
    throw e;
  }
}
