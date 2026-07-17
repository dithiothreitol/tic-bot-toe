import { type GameId, getBattleshipVariant } from '@arena/game-core';
import { and, desc, eq, or } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import {
  type PsychologyMatch,
  type PsychologyPayload,
  aggregateBattleship,
  aggregateTicTacToe,
  psychologySupported,
} from '../lib/psychology';
import { matches } from '../db/schema';

/**
 * GET /api/psychology?subjectId=&game=&variant=&mode= — behavioural distributions
 * for one subject (Module C, plan §5). Public read, no JWT — same posture as the
 * leaderboard: aggregated, non-personal.
 *
 * Reads the subject's most recent ≤500 non-lab matches in the game and aggregates
 * in JS (D7 — these are "soft stats", freshness is not critical). Results are
 * memoised in-process for `CACHE_TTL_MS`; after a deploy the first call is a cold
 * miss (a conscious trade-off — no Redis, plan risk #9).
 *
 * `mode` scopes the sample to model_vs_model / human_vs_model so the heatmap
 * tracks the card's mode toggle (an addition over the plan's query — see
 * DECISIONS). `variant` is required for battleship (board size fixes the grid);
 * tic-tac-toe ignores it. Unsupported games return a `null` payload → empty state.
 */

const MAX_MATCHES = 500;
const CACHE_TTL_MS = 10 * 60_000;

export interface PsychologyResponse {
  subjectId: string;
  game: GameId;
  variant: string;
  mode: string;
  /** Matches behind the payload (also `payload.n`) — surfaced for the empty-state gate. */
  n: number;
  /** null when the game has no Module C view yet (sudoku/scrabble). */
  payload: PsychologyPayload | null;
}

interface CacheEntry {
  at: number;
  data: PsychologyResponse;
}

export function psychologyRoute(deps: { db: Database; now?: () => number }): Hono {
  const app = new Hono();
  const now = deps.now ?? Date.now;
  // Per-app-instance cache: a fresh `buildApp` (every test) starts empty.
  const cache = new Map<string, CacheEntry>();

  app.get('/', async (c) => {
    const subjectId = c.req.query('subjectId');
    if (!subjectId) return c.json({ error: 'subjectId required' }, 400);
    const game = (c.req.query('game') ?? 'tictactoe') as GameId;
    const mode = c.req.query('mode') ?? 'model_vs_model';
    const variant = c.req.query('variant') ?? (game === 'battleship' ? 'small' : 'standard');

    const key = `${mode}|${game}|${variant}|${subjectId}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < CACHE_TTL_MS) {
      return c.json(cached.data);
    }

    let payload: PsychologyPayload | null = null;
    if (psychologySupported(game)) {
      // Battleship needs a valid board size; an unknown variant → empty, not a 500.
      let size: number | null = null;
      if (game === 'battleship') {
        try {
          size = getBattleshipVariant(variant).size;
        } catch {
          size = null;
        }
      }

      if (game === 'tictactoe' || size !== null) {
        const rows = await deps.db
          .select({
            p1Id: matches.p1Id,
            p2Id: matches.p2Id,
            winner: matches.winner,
            moves: matches.moves,
          })
          .from(matches)
          .where(
            and(
              eq(matches.mode, mode),
              eq(matches.game, game),
              eq(matches.variant, variant),
              eq(matches.lab, false),
              or(eq(matches.p1Id, subjectId), eq(matches.p2Id, subjectId)),
            ),
          )
          .orderBy(desc(matches.createdAt))
          .limit(MAX_MATCHES);

        const input: PsychologyMatch[] = rows.map((r) => ({
          p1Id: r.p1Id,
          p2Id: r.p2Id,
          winner: r.winner as PsychologyMatch['winner'],
          moves: normalizeMoves(r.moves),
        }));

        payload =
          game === 'tictactoe'
            ? aggregateTicTacToe(input, subjectId)
            : aggregateBattleship(input, subjectId, size!);
      }
    }

    const data: PsychologyResponse = {
      subjectId,
      game,
      variant,
      mode,
      n: payload?.n ?? 0,
      payload,
    };
    cache.set(key, { at: now(), data });
    return c.json(data);
  });

  return app;
}

/** Coerce the jsonb `moves` blob into the minimal {player, move} the aggregators read. */
function normalizeMoves(raw: unknown): PsychologyMatch['moves'] {
  if (!Array.isArray(raw)) return [];
  const out: PsychologyMatch['moves'] = [];
  for (const m of raw) {
    if (m && typeof m === 'object') {
      const player = (m as { player?: unknown }).player;
      const move = (m as { move?: unknown }).move;
      if ((player === 'p1' || player === 'p2') && (typeof move === 'number' || typeof move === 'string')) {
        out.push({ player, move });
      }
    }
  }
  return out;
}
