import type { Move, MoveTelemetry } from '@arena/game-core';

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
  moves: Array<{ player: 'p1' | 'p2'; move: Move; telemetry: MoveTelemetry }>;
  setup?: unknown;
  lab: boolean;
  priceSnapshot?: unknown;
  commentary?: unknown;
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
    })),
    setup: outcome.setup,
    lab: opts.lab ?? false,
    priceSnapshot: opts.priceSnapshot,
    commentary: opts.commentary,
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
