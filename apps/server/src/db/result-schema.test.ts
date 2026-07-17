import { describe, expect, it } from 'vitest';

import { resultPayloadSchema } from './result-schema';

/**
 * Wire validation of the Module A/B fields (plan „efekt wow" §10 Etap 0, D4).
 * Two things matter here: the new caps actually bite, and — the trap in ryzyko
 * #2 — a payload WITHOUT the fields still parses, since zod silently strips keys
 * it does not know. That silent strip is exactly why the fields must be declared.
 */

/** A minimal valid model_vs_model payload; `move` overrides merge onto moves[0]. */
function base(moveExtra: Record<string, unknown> = {}) {
  return {
    mode: 'model_vs_model',
    game: 'tictactoe',
    variant: 'standard',
    p1Id: 'openrouter:a',
    p2Id: 'openrouter:b',
    moves: [
      {
        player: 'p1',
        move: 0,
        telemetry: { latencyMs: 100, retries: 0, forfeit: false },
        ...moveExtra,
      },
    ],
  };
}

describe('resultPayloadSchema — Module A/B fields (D4)', () => {
  it('accepts a legacy payload with no thoughts/rejections (backward compat)', () => {
    const res = resultPayloadSchema.safeParse(base());
    expect(res.success).toBe(true);
  });

  it('accepts and preserves a trace + rejections within caps', () => {
    const res = resultPayloadSchema.safeParse(
      base({
        thoughts: 'I should take the center.',
        rejections: [
          { kind: 'illegal', reason: 'occupied', attempted: '0', raw: '{"cell":0}' },
          { kind: 'unparseable', raw: 'let me think...' },
          { kind: 'transport' },
        ],
      }),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.moves[0]!.thoughts).toBe('I should take the center.');
      expect(res.data.moves[0]!.rejections).toHaveLength(3);
    }
  });

  it('rejects a reasoning trace longer than 2000 chars', () => {
    const res = resultPayloadSchema.safeParse(base({ thoughts: 'x'.repeat(2001) }));
    expect(res.success).toBe(false);
  });

  it('rejects more than 4 rejections on one move', () => {
    const res = resultPayloadSchema.safeParse(
      base({ rejections: Array.from({ length: 5 }, () => ({ kind: 'transport' })) }),
    );
    expect(res.success).toBe(false);
  });

  it('rejects an over-long rejection excerpt', () => {
    const res = resultPayloadSchema.safeParse(
      base({ rejections: [{ kind: 'unparseable', raw: 'x'.repeat(241) }] }),
    );
    expect(res.success).toBe(false);
  });

  it('rejects an unknown rejection kind', () => {
    const res = resultPayloadSchema.safeParse(
      base({ rejections: [{ kind: 'made_up' }] }),
    );
    expect(res.success).toBe(false);
  });

  it('silently strips unknown per-move keys (why the fields must be declared)', () => {
    const res = resultPayloadSchema.safeParse(base({ smuggled: 'x'.repeat(9999) }));
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.moves[0]).not.toHaveProperty('smuggled');
    }
  });
});
