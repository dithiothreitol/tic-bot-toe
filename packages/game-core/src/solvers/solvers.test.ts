import { describe, expect, it } from 'vitest';

import type {
  BattleshipTrackingCell,
  BattleshipView,
  TicTacToeCell,
} from '../types';
import { analyzeMatch, analyzeTicTacToe } from './index';
import {
  battleshipHeatMap,
  classifyBattleshipShot,
} from './battleship';
import { classifyTicTacToeMove, ttMoveValues } from './tictactoe';

const _ = null;
function board(cells: (string | null)[]): TicTacToeCell[] {
  return cells.map((c) => c as TicTacToeCell);
}

describe('tic-tac-toe minimax', () => {
  it('scores every first move on the empty board as a draw (0)', () => {
    const values = ttMoveValues(Array<TicTacToeCell>(9).fill(null), 'X');
    expect([...values.values()].every((v) => v === 0)).toBe(true);
  });

  it('the block is the ONLY optimal move against an immediate threat', () => {
    // X threatens 0-1-2; O to move. Only 2 saves the draw.
    const b = board(['X', 'X', _, _, 'O', _, _, _, _]);
    expect(classifyTicTacToeMove(b, 2, 'O')).toBe('optimal');
    for (const cell of [3, 5, 6, 7, 8]) {
      expect(classifyTicTacToeMove(b, cell, 'O')).toBe('blunder');
    }
  });

  it('taking a winning line is optimal; the winning move has value +1', () => {
    const b = board(['X', 'X', _, _, _, _, _, _, _]);
    const values = ttMoveValues(b, 'X');
    expect(values.get(2)).toBe(1);
    expect(Math.max(...values.values())).toBe(1);
    expect(classifyTicTacToeMove(b, 2, 'X')).toBe('optimal');
  });

  it('from a lost position every move is "optimal" (cannot worsen)', () => {
    // X{4,6,8} forks 2-4-6 and 6-7-8; O (to move) can block only one → lost.
    const b = board(['O', _, _, _, 'X', 'O', 'X', _, 'X']);
    const values = ttMoveValues(b, 'O');
    expect(Math.max(...values.values())).toBe(-1);
    expect(classifyTicTacToeMove(b, 1, 'O')).toBe('optimal');
  });
});

describe('analyzeMatch / analyzeTicTacToe', () => {
  it('classifies a game with a decisive blunder and finds the turning point', () => {
    // X:0, O:4, X:1 (threat 2), O:3 (should block 2 — blunder), X:2 (win).
    const analysis = analyzeMatch('tictactoe', 'standard', null, [
      { player: 'p1', move: 0 },
      { player: 'p2', move: 4 },
      { player: 'p1', move: 1 },
      { player: 'p2', move: 3 },
      { player: 'p1', move: 2 },
    ]);
    expect(analysis.moves[3]).toMatchObject({ player: 'p2', quality: 'blunder' });
    expect(analysis.turningPoint).toBe(3);
    expect(analysis.accuracy.p1.rate).toBe(1); // X played perfectly
    expect(analysis.accuracy.p2.moves).toBe(2);
    expect(analysis.accuracy.p2.optimal).toBe(1); // center ok, then blundered
  });

  it('analyzeTicTacToe reconstructs from a final state', () => {
    // Same sequence (0,4,1,3,2) via the state-shaped convenience wrapper.
    const state = { variant: 'standard', board: board(['X', 'X', 'X', 'O', 'O', _, _, _, _]), moves: [0, 4, 1, 3, 2] };
    const a = analyzeTicTacToe(state);
    expect(a.moves).toHaveLength(5);
    expect(a.turningPoint).toBe(3); // O at index 3 fails to block cell 2
  });
});

// ---- Battleship heuristic ----
function view(
  size: number,
  tracking: BattleshipTrackingCell[],
  remaining: number[],
): BattleshipView {
  return {
    game: 'battleship',
    variant: 'test',
    side: 'p1',
    status: 'playing',
    moveNumber: 0,
    moveHistory: [],
    size,
    extraShotOnHit: true,
    ownBoard: [],
    trackingBoard: tracking,
    enemyShipsRemaining: remaining,
    legalTargets: [],
  };
}

describe('battleship shot heuristic', () => {
  it('hunting: a shot next to an unresolved hit is optimal', () => {
    const size = 4;
    const t = Array<BattleshipTrackingCell>(size * size).fill('unknown');
    t[5] = 'hit'; // row1,col1
    const v = view(size, t, [3, 2]);
    expect(classifyBattleshipShot(v, 4)).toBe('optimal'); // left of the hit
    expect(classifyBattleshipShot(v, 9)).toBe('optimal'); // below the hit
  });

  it('a cell boxed in by misses (heat 0) is a blunder', () => {
    const size = 4;
    const t = Array<BattleshipTrackingCell>(size * size).fill('unknown');
    // Box cell 5 (row1,col1) with misses on all orthogonal neighbours.
    for (const n of [1, 4, 6, 9]) t[n] = 'miss';
    const v = view(size, t, [2]);
    const heat = battleshipHeatMap(t, size, [2]);
    expect(heat[5]).toBe(0);
    expect(classifyBattleshipShot(v, 5)).toBe('blunder');
  });

  it('on an open board central cells outrank corners', () => {
    const size = 6;
    const t = Array<BattleshipTrackingCell>(size * size).fill('unknown');
    const heat = battleshipHeatMap(t, size, [3]);
    const center = 2 * size + 2; // (2,2)
    const corner = 0; // (0,0)
    expect(heat[center]).toBeGreaterThan(heat[corner]);
    expect(['optimal', 'good']).toContain(classifyBattleshipShot(view(size, t, [3]), center));
    expect(classifyBattleshipShot(view(size, t, [3]), corner)).not.toBe('optimal');
  });
});
