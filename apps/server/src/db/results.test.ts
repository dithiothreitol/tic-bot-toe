import { describe, expect, it } from 'vitest';

import { type ResultMove, displayAttempted, sanitizeStoredMoves } from './results';

/**
 * `sanitizeStoredMoves` is the pre-insert half of the controlled §16 exception
 * (plan „efekt wow" §10 Etap 0, D1): trim a reasoning trace, and never let the
 * HUMAN side keep Module A/B fields. Pure function → tested without a database.
 */

function move(over: Partial<ResultMove> & Pick<ResultMove, 'player'>): ResultMove {
  return {
    move: 0,
    telemetry: { latencyMs: 100, retries: 0, forfeit: false },
    ...over,
  };
}

describe('sanitizeStoredMoves (D1)', () => {
  it('trims a model-side reasoning trace to 2000 chars', () => {
    const out = sanitizeStoredMoves([move({ player: 'p1', thoughts: 'x'.repeat(5000) })], null);
    expect(out[0]!.thoughts).toHaveLength(2000);
  });

  it('leaves a short model-side trace and its rejections intact', () => {
    const rejections = [{ kind: 'illegal' as const, reason: 'occupied', attempted: '0' }];
    const out = sanitizeStoredMoves(
      [move({ player: 'p2', thoughts: 'take center', rejections })],
      'p1',
    );
    expect(out[0]!.thoughts).toBe('take center');
    expect(out[0]!.rejections).toEqual(rejections);
  });

  it('strips BOTH thoughts and rejections from the human side', () => {
    const out = sanitizeStoredMoves(
      [
        move({ player: 'p1', thoughts: 'a human cannot have this', rejections: [{ kind: 'transport' }] }),
        move({ player: 'p2', thoughts: 'model keeps it' }),
      ],
      'p1',
    );
    expect(out[0]).not.toHaveProperty('thoughts');
    expect(out[0]).not.toHaveProperty('rejections');
    expect(out[1]!.thoughts).toBe('model keeps it');
  });

  it('returns a move without the fields unchanged', () => {
    const m = move({ player: 'p1' });
    const out = sanitizeStoredMoves([m], null);
    expect(out[0]).toBe(m);
  });

  it('does not mutate the caller’s array (a later pass still sees originals)', () => {
    const input = [move({ player: 'p1', thoughts: 'x'.repeat(5000) })];
    sanitizeStoredMoves(input, null);
    expect(input[0]!.thoughts).toHaveLength(5000);
  });
});

describe('displayAttempted (scrabble word extraction, D6)', () => {
  it('strips the coordinate+direction prefix so the museum stores the word', () => {
    expect(displayAttempted('scrabble', 'H8>KWIZŁO')).toBe('KWIZŁO');
    expect(displayAttempted('scrabble', 'A1vFOO')).toBe('FOO');
    expect(displayAttempted('scrabble', 'O15>bar')).toBe('bar'); // blank = lowercase, preserved
  });

  it('keeps non-place scrabble notations and other games verbatim', () => {
    expect(displayAttempted('scrabble', 'PASS')).toBe('PASS');
    expect(displayAttempted('scrabble', 'EXCH:AB')).toBe('EXCH:AB');
    expect(displayAttempted('tictactoe', '4')).toBe('4');
    expect(displayAttempted('battleship', 'C5')).toBe('C5');
  });
});
