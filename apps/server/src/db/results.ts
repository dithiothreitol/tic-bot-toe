import {
  ELO_START,
  type GameId,
  type Move,
  type ReplayMove,
  movesHash,
  replayMatch,
  updateElo,
} from '@arena/game-core';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from './client';
import { eloHistory, matches, ratings, usedJti } from './schema';

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
}

export interface RatingChange {
  subjectId: string;
  before: number;
  after: number;
}
export type SubmitResult =
  | { ok: true; matchId: string; winner: 'p1' | 'p2' | 'draw'; lab: boolean; ratingChanges: RatingChange[] }
  | { ok: false; code: 400 | 401 | 409 | 422; reason: string };

const MAX_TOKENS_PER_MOVE = 5000;
const MAX_COST_PER_MATCH = 1;
const MIN_AVG_LATENCY_MS = 3000; // SPEC §15 (openrouter only; not local providers)

class Abort {
  constructor(
    readonly code: 409,
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
}

function aggregate(payload: ResultPayload, side: 'p1' | 'p2'): SideAgg {
  const id = side === 'p1' ? payload.p1Id : payload.p2Id;
  const mv = payload.moves.filter((m) => m.player === side);
  return {
    id,
    moveCount: mv.length,
    latencySum: mv.reduce((s, m) => s + m.telemetry.latencyMs, 0),
    tokens: mv.reduce(
      (s, m) => s + (m.telemetry.promptTokens ?? 0) + (m.telemetry.completionTokens ?? 0),
      0,
    ),
    cost: mv.reduce((s, m) => s + (m.telemetry.costUsd ?? 0), 0),
    forfeits: mv.filter((m) => m.telemetry.forfeit).length,
  };
}

/** OpenRouter moves faster than 3s avg are suspicious (§15); local providers exempt. */
function suspiciousTiming(agg: SideAgg): boolean {
  return (
    agg.id.startsWith('openrouter:') &&
    agg.moveCount > 0 &&
    agg.latencySum / agg.moveCount < MIN_AVG_LATENCY_MS
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
      },
    });
}

export async function submitResult(
  db: Database,
  jti: string,
  payload: ResultPayload,
  clientIp: string | null,
): Promise<SubmitResult> {
  if (!Array.isArray(payload.moves) || payload.moves.length === 0) {
    return { ok: false, code: 400, reason: 'no moves' };
  }

  // 1. Server replay — the winner is authoritative, never trusted from client.
  const replayMoves: ReplayMove[] = payload.moves.map((m) => ({ player: m.player, move: m.move }));
  const replay = replayMatch(payload.game, payload.variant, payload.setup as never, replayMoves);
  if (!replay.valid) return { ok: false, code: 422, reason: `replay: ${replay.reason}` };
  if (replay.winner === null) return { ok: false, code: 422, reason: 'match not finished' };
  const winner = replay.winner;

  const s1 = aggregate(payload, 'p1');
  const s2 = aggregate(payload, 'p2');

  // 2. Sanity: suspicious OpenRouter timing.
  if (suspiciousTiming(s1) || suspiciousTiming(s2)) {
    return { ok: false, code: 422, reason: 'suspicious_timing' };
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
  const lab = payload.lab ?? false;
  // Ollama runs through our proxy, so those matches are genuinely server-side
  // (SPEC §2.3). Computed from ids, not trusted from the client.
  const serverVerified =
    payload.p1Id.startsWith('ollama:') || payload.p2Id.startsWith('ollama:');

  try {
    return await db.transaction(async (tx) => {
      // One-time jti (§15).
      const jtiRow = await tx.insert(usedJti).values({ jti }).onConflictDoNothing().returning();
      if (jtiRow.length === 0) throw new Abort(409, 'jti_used');

      // Insert match; dedup on moves_hash.
      const inserted = await tx
        .insert(matches)
        .values({
          mode: payload.mode,
          game: payload.game,
          variant: payload.variant,
          p1Id: payload.p1Id,
          p2Id: payload.p2Id,
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
          clientIp: sanitizeIp(clientIp),
        })
        .onConflictDoNothing({ target: matches.movesHash })
        .returning({ id: matches.id });
      if (inserted.length === 0) throw new Abort(409, 'duplicate');
      const matchId = inserted[0].id;

      // lab=true never touches ratings / elo_history (§13).
      if (lab) {
        return { ok: true, matchId, winner, lab: true, ratingChanges: [] };
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

      await tx.insert(eloHistory).values([
        { subjectId: s1.id, mode: payload.mode, game: payload.game, variant: payload.variant, matchId, eloAfter: a },
        { subjectId: s2.id, mode: payload.mode, game: payload.game, variant: payload.variant, matchId, eloAfter: b },
      ]);

      return {
        ok: true,
        matchId,
        winner,
        lab: false,
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
