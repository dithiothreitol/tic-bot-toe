import type { Move, MoveRejectionRecord, MoveTelemetry } from '@arena/game-core';

import { ApiError, type SaveResultResponse, apiPost } from '@/api/client';
import type { MatchOutcome } from '@/game/orchestrator';
import { clearSession, ensureSession } from '@/store/session';
import { getPlayerToken } from '@/store/settings';

interface ResultPayload {
  mode: string;
  game: string;
  variant: string;
  p1Id: string;
  p2Id: string;
  moves: Array<{
    player: 'p1' | 'p2';
    move: Move;
    telemetry: MoveTelemetry;
    /** Reasoning trace (Module A) — persisted only on this explicit save (§16 exception, D1). */
    thoughts?: string;
    /** Rejected attempts (Module B). */
    rejections?: MoveRejectionRecord[];
  }>;
  setup?: unknown;
  lab: boolean;
  priceSnapshot?: unknown;
  commentary?: unknown;
  /** Match-start token (§15.3) — the server needs it to rank a human match. */
  startToken?: string;
}

export interface SaveResultOptions {
  priceSnapshot?: unknown;
  /** Prompt-lab match (§12.4): saved for replays, excluded from Elo (server-enforced). */
  lab?: boolean;
  /** Commentator bubbles (§12.1), opt-in — [{moveIndex, text, modelId}]. */
  commentary?: unknown;
  /** Match-start token (§15.3) — required for a ranked human match. */
  startToken?: string;
}

export function buildResultPayload(
  outcome: MatchOutcome,
  opts: SaveResultOptions = {},
): ResultPayload {
  return {
    mode: outcome.mode,
    game: outcome.game,
    variant: outcome.variant,
    p1Id: outcome.p1Id,
    p2Id: outcome.p2Id,
    moves: outcome.moves.map((m) => ({
      player: m.player,
      move: m.move,
      telemetry: m.telemetry,
      // Only sent when the runner produced them; the server trims/strips again
      // (defense in depth) and drops both from the human side (D1).
      ...(m.thoughts !== undefined ? { thoughts: m.thoughts } : {}),
      ...(m.rejections !== undefined ? { rejections: m.rejections } : {}),
    })),
    setup: outcome.setup,
    lab: opts.lab ?? false,
    priceSnapshot: opts.priceSnapshot,
    commentary: opts.commentary,
    // Without this the server never sees the start token → a ranked human match
    // is rejected as `missing_start_token` (the whole match-start anchor is moot).
    startToken: opts.startToken,
  };
}

/**
 * Ensure a Turnstile session, then POST the match to /api/result. In
 * human_vs_model we also send the identity token, so this person's matches all
 * land in one ranking row instead of the shared anonymous 'human' bucket (§10).
 */
export async function saveResult(
  outcome: MatchOutcome,
  opts: SaveResultOptions = {},
): Promise<SaveResultResponse> {
  const token = await ensureSession();
  const playerToken = outcome.mode === 'human_vs_model' ? getPlayerToken() : undefined;
  try {
    return await apiPost<SaveResultResponse>('/api/result', buildResultPayload(outcome, opts), {
      token,
      playerToken,
    });
  } catch (e) {
    // A spent or rejected session must not linger — the next attempt should
    // re-verify through Turnstile rather than replay a dead token.
    if (e instanceof ApiError && (e.status === 401 || e.message === 'jti_used')) {
      clearSession();
    }
    throw e;
  }
}
