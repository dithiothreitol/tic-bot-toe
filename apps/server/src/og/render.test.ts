import { describe, expect, it } from 'vitest';

import { type OgMatch, renderMatchOg } from './render';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('renderMatchOg', () => {
  it('renders a tic-tac-toe match to a PNG buffer (< 1s, §20.7)', () => {
    const match: OgMatch = {
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'openrouter:claude-opus-4',
      p2Id: 'openrouter:gpt-5',
      winner: 'p1',
      setup: null,
      moves: [
        { player: 'p1', move: 0 },
        { player: 'p2', move: 4 },
        { player: 'p1', move: 1 },
        { player: 'p2', move: 3 },
        { player: 'p1', move: 2 },
      ],
    };
    const start = performance.now();
    const png = renderMatchOg(match);
    expect(png.length).toBeGreaterThan(1000);
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('falls back to a title card on a corrupt move list (never throws)', () => {
    const match: OgMatch = {
      game: 'tictactoe',
      variant: 'standard',
      p1Id: 'a',
      p2Id: 'b',
      winner: null,
      setup: null,
      moves: 'not-an-array',
    };
    const png = renderMatchOg(match);
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });
});
