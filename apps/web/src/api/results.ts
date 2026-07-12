import type { Move, MoveTelemetry } from '@arena/game-core';

import { type SaveResultResponse, apiPost } from '@/api/client';
import type { MatchOutcome } from '@/game/orchestrator';
import { ensureSession } from '@/store/session';

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
}

export function buildResultPayload(
  outcome: MatchOutcome,
  priceSnapshot?: unknown,
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
    lab: false,
    priceSnapshot,
  };
}

/** Ensure a Turnstile session, then POST the match to /api/result. */
export async function saveResult(
  outcome: MatchOutcome,
  priceSnapshot?: unknown,
): Promise<SaveResultResponse> {
  const token = await ensureSession();
  return apiPost<SaveResultResponse>('/api/result', buildResultPayload(outcome, priceSnapshot), token);
}
