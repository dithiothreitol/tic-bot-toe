import { describe, expect, it } from 'vitest';

import {
  type PsychologyMatch,
  aggregateBattleship,
  aggregateTicTacToe,
  psychologySupported,
} from './psychology';

const S = 'openrouter:subject';
const O = 'openrouter:opponent';

function ttt(
  side: 'p1' | 'p2',
  cells: number[],
  winner: 'p1' | 'p2' | 'draw' | null,
): PsychologyMatch {
  const other = side === 'p1' ? 'p2' : 'p1';
  // Interleave the subject's cells with throwaway opponent moves so ordering is realistic.
  const moves: PsychologyMatch['moves'] = [];
  cells.forEach((c, i) => {
    moves.push({ player: side, move: c });
    moves.push({ player: other, move: 100 + i }); // opponent filler, never counted
  });
  return {
    p1Id: side === 'p1' ? S : O,
    p2Id: side === 'p1' ? O : S,
    winner,
    moves,
  };
}

describe('aggregateTicTacToe (Module C)', () => {
  it('counts openings, wins-by-opening and all moves for the subject only', () => {
    const matches = [
      ttt('p1', [4, 0, 8], 'p1'), // opened center, won
      ttt('p1', [4, 2], 'p2'), // opened center, lost
      ttt('p2', [0, 4], 'p2'), // opened corner 0, won
    ];
    const r = aggregateTicTacToe(matches, S);

    expect(r.n).toBe(3);
    expect(r.firstMoveCounts[4]).toBe(2); // center opened twice
    expect(r.firstMoveCounts[0]).toBe(1); // corner opened once
    expect(r.firstMoveWins[4]).toBe(1); // won once when opening center
    expect(r.firstMoveWins[0]).toBe(1); // won the corner opening
    // All subject moves: 4,0,8 + 4,2 + 0,4 → cell 4 played 3×, cell 0 played 2×.
    expect(r.moveCounts[4]).toBe(3);
    expect(r.moveCounts[0]).toBe(2);
    expect(r.moveCounts[8]).toBe(1);
    // Opponent filler (100+) never leaks into the 9-cell arrays.
    expect(r.moveCounts.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('tolerates a stringified cell and drops out-of-range values', () => {
    const m: PsychologyMatch = {
      p1Id: S,
      p2Id: O,
      winner: 'draw',
      moves: [
        { player: 'p1', move: '3' }, // stringified → cell 3
        { player: 'p1', move: 99 }, // out of range → ignored
      ],
    };
    const r = aggregateTicTacToe([m], S);
    expect(r.firstMoveCounts[3]).toBe(1);
    expect(r.moveCounts[3]).toBe(1);
    expect(r.moveCounts.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('excludes forfeited moves — a random substitute is not a decision', () => {
    const m: PsychologyMatch = {
      p1Id: S,
      p2Id: O,
      winner: 'p1',
      moves: [
        { player: 'p1', move: 0, forfeit: true }, // injected random → must not count
        { player: 'p2', move: 3 },
        { player: 'p1', move: 4 }, // real decision → the true opening
      ],
    };
    const r = aggregateTicTacToe([m], S);
    expect(r.n).toBe(1); // the match still counts toward the sample
    expect(r.firstMoveCounts[0]).toBe(0); // forfeited cell never becomes the "opening"
    expect(r.firstMoveCounts[4]).toBe(1); // first NON-forfeit move is the opening
    expect(r.moveCounts[0]).toBe(0);
    expect(r.moveCounts[4]).toBe(1);
  });

  it('ignores matches the subject is not part of', () => {
    const foreign: PsychologyMatch = {
      p1Id: O,
      p2Id: 'openrouter:third',
      winner: 'p1',
      moves: [{ player: 'p1', move: 4 }],
    };
    const r = aggregateTicTacToe([foreign], S);
    expect(r.n).toBe(0);
    expect(r.firstMoveCounts[4]).toBe(0);
  });
});

describe('aggregateBattleship (Module C)', () => {
  it('counts every shot and only the first shot per match, in row-major cells', () => {
    // 6×6: "A1" → row0 col0 = cell 0; "B1" → col1 = cell 1; "A2" → row1 = cell 6.
    const matches: PsychologyMatch[] = [
      {
        p1Id: S,
        p2Id: O,
        winner: 'p1',
        moves: [
          { player: 'p1', move: 'A1' },
          { player: 'p2', move: 'C3' }, // opponent, ignored
          { player: 'p1', move: 'B1' },
          { player: 'p1', move: 'A2' },
        ],
      },
      {
        p1Id: O,
        p2Id: S,
        winner: 'p2',
        moves: [{ player: 'p2', move: 'A1' }],
      },
    ];
    const r = aggregateBattleship(matches, S, 6);

    expect(r.n).toBe(2);
    expect(r.size).toBe(6);
    expect(r.shotCounts).toHaveLength(36);
    expect(r.shotCounts[0]).toBe(2); // A1 fired in both matches
    expect(r.shotCounts[1]).toBe(1); // B1
    expect(r.shotCounts[6]).toBe(1); // A2 (row 1)
    expect(r.firstShotCounts[0]).toBe(2); // A1 was the opening shot both times
    expect(r.firstShotCounts[1]).toBe(0);
    expect(r.shotCounts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('excludes forfeited shots from the shot map', () => {
    const m: PsychologyMatch = {
      p1Id: S,
      p2Id: O,
      winner: 'p1',
      moves: [
        { player: 'p1', move: 'A1', forfeit: true }, // random substitute → skip
        { player: 'p1', move: 'B1' }, // real first shot → cell 1
      ],
    };
    const r = aggregateBattleship([m], S, 6);
    expect(r.shotCounts[0]).toBe(0); // forfeited A1 not counted
    expect(r.shotCounts[1]).toBe(1);
    expect(r.firstShotCounts[1]).toBe(1); // first real shot is the opening
    expect(r.firstShotCounts[0]).toBe(0);
  });

  it('skips malformed / off-board coordinates', () => {
    const m: PsychologyMatch = {
      p1Id: S,
      p2Id: O,
      winner: 'draw',
      moves: [
        { player: 'p1', move: 'Z9' }, // off a 6×6 board → skipped
        { player: 'p1', move: 'A1' },
      ],
    };
    const r = aggregateBattleship([m], S, 6);
    expect(r.shotCounts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(r.firstShotCounts[0]).toBe(1); // A1 becomes the effective first valid shot
  });
});

describe('psychologySupported', () => {
  it('accepts the two rendered games, rejects the rest', () => {
    expect(psychologySupported('tictactoe')).toBe(true);
    expect(psychologySupported('battleship')).toBe(true);
    expect(psychologySupported('sudoku')).toBe(false);
    expect(psychologySupported('scrabble')).toBe(false);
  });
});
