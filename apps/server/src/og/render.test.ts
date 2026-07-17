import { sudoku } from '@arena/game-core';
import { describe, expect, it } from 'vitest';

import { type OgMatch, renderMatchOg } from './render';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** A few valid (correct) sudoku placements for a mini board, from a fixed seed. */
function sudokuMoves(seed: number, count: number): { player: 'p1' | 'p2'; move: string }[] {
  const variant = sudoku.variants.find((v) => v.id === 'mini')!;
  let state = sudoku.createInitialState(variant, { seed });
  const out: { player: 'p1' | 'p2'; move: string }[] = [];
  for (let i = 0; i < count && sudoku.status(state) === 'playing'; i++) {
    const side = sudoku.currentPlayer(state);
    const cell = state.board.findIndex((v) => v === null);
    const move = `r${Math.floor(cell / state.size) + 1}c${(cell % state.size) + 1}=${state.solution[cell]}`;
    out.push({ player: side, move });
    state = sudoku.applyMove(state, side, move);
  }
  return out;
}

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

  it('renders a sudoku match to a PNG buffer from its seed', () => {
    const match: OgMatch = {
      game: 'sudoku',
      variant: 'mini',
      p1Id: 'openrouter:deducer',
      p2Id: 'openrouter:guesser',
      winner: 'p1',
      setup: { game: 'sudoku', variant: 'mini', seed: 3 },
      moves: sudokuMoves(3, 4),
    };
    const png = renderMatchOg(match);
    expect(png.length).toBeGreaterThan(1000);
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('renders a scrabble (Word Battle) match to a PNG buffer', () => {
    const match: OgMatch = {
      game: 'scrabble',
      variant: 'pl',
      p1Id: 'openrouter:a',
      p2Id: 'openrouter:b',
      winner: 'draw',
      setup: { game: 'scrabble', variant: 'pl', seed: 1 },
      moves: [], // empty board is enough to exercise the scrabble draw path
    };
    const png = renderMatchOg(match);
    expect(png.length).toBeGreaterThan(1000);
    expect(png.subarray(0, 4)).toEqual(PNG_MAGIC);
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
