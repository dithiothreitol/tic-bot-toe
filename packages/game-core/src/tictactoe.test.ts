import { describe, expect, it } from 'vitest';

import { getGame } from './index';
import {
  currentTurn,
  symbolFor,
  ticTacToe,
  TICTACTOE_VARIANTS,
  type TicTacToeState,
} from './tictactoe';
import type { PlayerSide, TicTacToeCell } from './types';

const variant = TICTACTOE_VARIANTS[0];

function emptyBoard(): TicTacToeCell[] {
  return Array<TicTacToeCell>(9).fill(null);
}

function boardState(board: TicTacToeCell[]): TicTacToeState {
  return { variant: 'standard', board, moves: [] };
}

/** Play a sequence of cells alternating p1, p2, p1, … from a fresh game. */
function play(moves: number[]): TicTacToeState {
  let s = ticTacToe.createInitialState(variant, {});
  let side: PlayerSide = 'p1';
  for (const m of moves) {
    s = ticTacToe.applyMove(s, side, m);
    side = side === 'p1' ? 'p2' : 'p1';
  }
  return s;
}

const WINNING_LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

describe('symbolFor / currentTurn', () => {
  it('maps p1→X, p2→O', () => {
    expect(symbolFor('p1')).toBe('X');
    expect(symbolFor('p2')).toBe('O');
  });

  it('p1 moves first and turns alternate', () => {
    expect(currentTurn(play([]))).toBe('p1');
    expect(currentTurn(play([4]))).toBe('p2');
    expect(currentTurn(play([4, 0]))).toBe('p1');
    expect(currentTurn(play([4, 0, 8]))).toBe('p2');
  });

  it('exposes currentPlayer on the GameDefinition', () => {
    expect(ticTacToe.currentPlayer(play([]))).toBe('p1');
    expect(ticTacToe.currentPlayer(play([4]))).toBe('p2');
  });
});

describe('createInitialState', () => {
  it('is an empty 9-cell board with no moves', () => {
    const s = ticTacToe.createInitialState(variant, {});
    expect(s.board).toHaveLength(9);
    expect(s.board.every((c) => c === null)).toBe(true);
    expect(s.moves).toEqual([]);
    expect(s.variant).toBe('standard');
  });
});

describe('legalMoves', () => {
  it('returns all cells for the player to move at the start', () => {
    const s = ticTacToe.createInitialState(variant, {});
    expect(ticTacToe.legalMoves(s, 'p1')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('returns [] for the side whose turn it is not', () => {
    const s = ticTacToe.createInitialState(variant, {});
    expect(ticTacToe.legalMoves(s, 'p2')).toEqual([]);
  });

  it('excludes occupied cells', () => {
    const s = play([4, 0]);
    expect(ticTacToe.legalMoves(s, 'p1')).toEqual([1, 2, 3, 5, 6, 7, 8]);
  });

  it('returns [] once the game is over', () => {
    const s = play([0, 3, 1, 4, 2]); // X wins top row
    expect(ticTacToe.status(s)).toBe('p1_won');
    expect(ticTacToe.legalMoves(s, 'p1')).toEqual([]);
    expect(ticTacToe.legalMoves(s, 'p2')).toEqual([]);
  });
});

describe('applyMove', () => {
  it('places the moving player symbol and records the move', () => {
    const s = ticTacToe.applyMove(ticTacToe.createInitialState(variant, {}), 'p1', 4);
    expect(s.board[4]).toBe('X');
    expect(s.moves).toEqual([4]);
  });

  it('is immutable — the input state is untouched', () => {
    const s0 = ticTacToe.createInitialState(variant, {});
    const s1 = ticTacToe.applyMove(s0, 'p1', 0);
    expect(s0.board[0]).toBeNull();
    expect(s0.moves).toEqual([]);
    expect(s1).not.toBe(s0);
    expect(s1.board).not.toBe(s0.board);
  });

  it('throws when the cell is occupied', () => {
    const s = ticTacToe.applyMove(ticTacToe.createInitialState(variant, {}), 'p1', 0);
    expect(() => ticTacToe.applyMove(s, 'p2', 0)).toThrow(/occupied/);
  });

  it('throws when the cell is out of range', () => {
    const s = ticTacToe.createInitialState(variant, {});
    expect(() => ticTacToe.applyMove(s, 'p1', 9)).toThrow(/out of range/);
    expect(() => ticTacToe.applyMove(s, 'p1', -1)).toThrow(/out of range/);
  });

  it("throws when it is not the player's turn", () => {
    const s = ticTacToe.createInitialState(variant, {});
    expect(() => ticTacToe.applyMove(s, 'p2', 0)).toThrow(/not p2's turn/);
  });

  it('throws when the game is already over', () => {
    const s = play([0, 3, 1, 4, 2]); // X won
    expect(() => ticTacToe.applyMove(s, 'p2', 5)).toThrow(/already over/);
  });
});

describe('status', () => {
  it('is "playing" on a fresh board', () => {
    expect(ticTacToe.status(ticTacToe.createInitialState(variant, {}))).toBe('playing');
  });

  it('detects p1_won for every winning line of X', () => {
    for (const [a, b, c] of WINNING_LINES) {
      const board = emptyBoard();
      board[a] = 'X';
      board[b] = 'X';
      board[c] = 'X';
      expect(ticTacToe.status(boardState(board))).toBe('p1_won');
    }
  });

  it('detects p2_won for every winning line of O', () => {
    for (const [a, b, c] of WINNING_LINES) {
      const board = emptyBoard();
      board[a] = 'O';
      board[b] = 'O';
      board[c] = 'O';
      expect(ticTacToe.status(boardState(board))).toBe('p2_won');
    }
  });

  it('detects a draw on a full board with no line', () => {
    // X O X / X O O / O X X
    const board: TicTacToeCell[] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
    expect(ticTacToe.status(boardState(board))).toBe('draw');
  });

  it('reaches a draw through real play', () => {
    const s = play([4, 0, 8, 5, 3, 6, 2, 1, 7]);
    expect(ticTacToe.status(s)).toBe('draw');
  });
});

describe('viewFor (no hidden information)', () => {
  it('shows the same full board to both sides', () => {
    const s = play([4, 0, 8]);
    const v1 = ticTacToe.viewFor(s, 'p1');
    const v2 = ticTacToe.viewFor(s, 'p2');
    expect(v1.board).toEqual(v2.board);
    expect(v1.board).toEqual(s.board);
    expect(v1.symbol).toBe('X');
    expect(v2.symbol).toBe('O');
  });

  it('carries side, moveNumber and ordered history', () => {
    const v = ticTacToe.viewFor(play([4, 0, 8]), 'p2');
    expect(v.side).toBe('p2');
    expect(v.moveNumber).toBe(3);
    expect(v.moveHistory).toEqual([4, 0, 8]);
  });

  it('returns a copy of the board (mutating the view does not affect state)', () => {
    const s = play([0]);
    const v = ticTacToe.viewFor(s, 'p2');
    v.board[1] = 'O';
    expect(s.board[1]).toBeNull();
  });
});

describe('renderPrompt', () => {
  it('produces the SPEC §6 system + user prompt (snapshot)', () => {
    const s = play([4, 0]); // X center, O corner; p1 to move
    const view = ticTacToe.viewFor(s, 'p1');
    const legal = ticTacToe.legalMoves(s, 'p1');
    const { system, user } = ticTacToe.renderPrompt(view, legal);

    expect(system).toMatchInlineSnapshot(`
      "You are playing tic-tac-toe. You play as X.
      The board uses cell indices 0-8 (left-to-right, top-to-bottom).
      Current board:
       O | 1 | 2
      ---+---+---
       3 | X | 5
      ---+---+---
       6 | 7 | 8
      Occupied cells: 0=O, 4=X
      Legal moves: 1, 2, 3, 5, 6, 7, 8
      Respond with ONLY a JSON object: {"move": <cell_index>}
      No explanation, no markdown, no code fences."
    `);
    expect(user).toMatchInlineSnapshot(
      `"Move history (cells, oldest first): 4, 0. Your move."`,
    );
  });

  it('reasoning mode allows a short chain-of-thought and still ends on the JSON contract', () => {
    const s = play([4, 0]);
    const view = ticTacToe.viewFor(s, 'p1');
    const legal = ticTacToe.legalMoves(s, 'p1');
    const { system } = ticTacToe.renderPrompt(view, legal, { reasoning: true });

    // Board + legal moves are unchanged from the default prompt…
    expect(system).toContain('Legal moves: 1, 2, 3, 5, 6, 7, 8');
    // …but the "no explanation" gag is gone and the win/block/centre heuristic is in.
    expect(system).not.toContain('No explanation');
    expect(system).toMatch(/WIN/);
    expect(system).toMatch(/BLOCK/);
    // The parse target is still the JSON object, so parseMove / replay are unaffected.
    expect(system).toContain('{"move": <cell_index>}');
    // A reasoned answer that ends with the JSON still parses to the right cell.
    expect(
      ticTacToe.parseMove('Centre is taken, I should block at 1.\n{"move": 1}', legal),
    ).toBe(1);
  });

  it('tells the first mover they move first', () => {
    const s = ticTacToe.createInitialState(variant, {});
    const { user } = ticTacToe.renderPrompt(
      ticTacToe.viewFor(s, 'p1'),
      ticTacToe.legalMoves(s, 'p1'),
    );
    expect(user).toBe('You move first. Make your move.');
  });

  it('rejects a view from a different game (defensive guard)', () => {
    const wrongView = { game: 'battleship' } as unknown as Parameters<
      typeof ticTacToe.renderPrompt
    >[0];
    expect(() => ticTacToe.renderPrompt(wrongView, [])).toThrow(/Expected tictactoe view/);
  });
});

describe('parseMove', () => {
  const legal = [1, 2, 3, 5, 6, 7, 8];

  it('tier 1: strict JSON object', () => {
    expect(ticTacToe.parseMove('{"move": 5}', legal)).toBe(5);
  });

  it('tier 1: coerces a stringified number', () => {
    expect(ticTacToe.parseMove('{"move": "7"}', legal)).toBe(7);
  });

  it('tier 1: ignores extra keys', () => {
    expect(ticTacToe.parseMove('{"move": 3, "reason": "block"}', legal)).toBe(3);
  });

  it('tier 2: JSON embedded in code fences', () => {
    expect(ticTacToe.parseMove('```json\n{"move": 2}\n```', legal)).toBe(2);
  });

  it('tier 2: JSON embedded in prose', () => {
    expect(ticTacToe.parseMove('I will play {"move": 6} now.', legal)).toBe(6);
  });

  it('tier 3: a lone digit in prose', () => {
    expect(ticTacToe.parseMove('Let me choose cell 3.', legal)).toBe(3);
  });

  it('tier 3: does not misread a multi-digit number', () => {
    expect(ticTacToe.parseMove('cell 12', legal)).toBeNull();
  });

  it('parses a bare numeric response', () => {
    expect(ticTacToe.parseMove('5', legal)).toBe(5);
  });

  it('returns null for a parseable but illegal (occupied) move', () => {
    expect(ticTacToe.parseMove('{"move": 4}', legal)).toBeNull();
  });

  it('returns null for an out-of-range move', () => {
    expect(ticTacToe.parseMove('{"move": 9}', legal)).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(ticTacToe.parseMove('no idea, pass', [0, 4])).toBeNull();
  });
});

describe('serializeSetup', () => {
  it('records game and variant only (no hidden setup)', () => {
    const s = ticTacToe.createInitialState(variant, {});
    expect(ticTacToe.serializeSetup(s)).toEqual({ game: 'tictactoe', variant: 'standard' });
  });
});

describe('getGame registry', () => {
  it('resolves tictactoe', () => {
    expect(getGame('tictactoe')).toBe(ticTacToe);
  });

  it('throws on an unknown game', () => {
    // @ts-expect-error — exercising the runtime guard with an invalid id
    expect(() => getGame('chess')).toThrow(/Unknown game/);
  });
});
