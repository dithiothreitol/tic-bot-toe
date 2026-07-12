import { z } from 'zod';

/**
 * Wire validation for POST /api/result (SPEC §15). The payload arrives from a
 * browser we do not control, so nothing may be trusted — not even its shape.
 * Without this, a move missing `telemetry` crashes the aggregation with a
 * TypeError (500) instead of a clean 400.
 */

/** A subject id: 'openrouter:<model>', 'webllm:<model>', 'ollama:<model>' or 'human'. */
const subjectId = z.string().min(1).max(200);

const telemetry = z.object({
  latencyMs: z.number().finite().nonnegative(),
  promptTokens: z.number().finite().nonnegative().optional(),
  completionTokens: z.number().finite().nonnegative().optional(),
  retries: z.number().int().nonnegative(),
  forfeit: z.boolean(),
  costUsd: z.number().finite().nonnegative().optional(),
});

/** `Move` is `number | string` in game-core; the engine replay validates the value. */
const move = z.union([z.number().finite(), z.string().max(20)]);

const resultMove = z.object({
  player: z.enum(['p1', 'p2']),
  move,
  eval: z.object({ quality: z.enum(['optimal', 'good', 'weak', 'blunder']) }).optional(),
});

export const resultPayloadSchema = z.object({
  mode: z.enum(['model_vs_model', 'human_vs_model']),
  game: z.enum(['tictactoe', 'battleship']),
  variant: z.string().min(1).max(50),
  p1Id: subjectId,
  p2Id: subjectId,
  moves: z.array(resultMove.extend({ telemetry })).min(1).max(500),
  setup: z.unknown().optional(),
  lab: z.boolean().optional(),
  priceSnapshot: z.unknown().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  commentary: z.unknown().optional(),
  startToken: z.string().max(2000).optional(),
  // `serverVerified` is deliberately absent: the server derives it from the ids.
});

export type ValidatedResultPayload = z.infer<typeof resultPayloadSchema>;

/**
 * The `human:` namespace is minted by the server from a verified player token.
 * A client that supplies it is trying to write into someone's ranking row
 * without proving identity — which would also skip every anti-bot layer, since
 * the human side is recognised by the literal id 'human'.
 */
export function usesReservedSubjectId(p: { mode: string; p1Id: string; p2Id: string }): boolean {
  const ids = [p.p1Id, p.p2Id];
  if (ids.some((id) => id.startsWith('human:'))) return true;
  // Only human_vs_model may claim the human marker at all.
  return p.mode === 'model_vs_model' && ids.some((id) => id === 'human');
}
