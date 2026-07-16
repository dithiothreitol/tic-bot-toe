import { describe, expect, it } from 'vitest';

import { replayMatch, type ReplayMove } from './replay';
import {
  SUDOKU_VARIANTS_CONFIG,
  type SudokuState,
  cellToRC,
  sudoku,
} from './sudoku';
import type { PlayerSide } from './types';

const VARIANT_IDS = Object.keys(SUDOKU_VARIANTS_CONFIG);

function stateForSeed(variantId: string, seed: number): SudokuState {
  const variant = sudoku.variants.find((v) => v.id === variantId)!;
  return sudoku.createInitialState(variant, { seed });
}

/** Count solutions of a board (null = empty) up to a cap — mirrors the engine's uniqueness test. */
function countSolutions(state: SudokuState, cap: number): number {
  const { size, boxRows, boxCols } = state;
  const g = state.board.map((v) => v ?? 0);
  const boxesPerRow = size / boxCols;
  const boxOf = (cell: number): number =>
    Math.floor(Math.floor(cell / size) / boxRows) * boxesPerRow +
    Math.floor((cell % size) / boxCols);
  const clash = (cell: number, d: number): boolean => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    for (let c = 0; c < size; c++) if (g[row * size + c] === d) return true;
    for (let r = 0; r < size; r++) if (g[r * size + col] === d) return true;
    const b = boxOf(cell);
    for (let rc = 0; rc < size * size; rc++) if (g[rc] === d && boxOf(rc) === b) return true;
    return false;
  };
  let count = 0;
  const solve = (): void => {
    if (count >= cap) return;
    let best = -1;
    let bestCands: number[] | null = null;
    for (let pos = 0; pos < g.length; pos++) {
      if (g[pos] !== 0) continue;
      const cands: number[] = [];
      for (let d = 1; d <= size; d++) if (!clash(pos, d)) cands.push(d);
      if (cands.length === 0) return;
      if (bestCands === null || cands.length < bestCands.length) {
        best = pos;
        bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    if (best === -1) {
      count += 1;
      return;
    }
    for (const d of bestCands!) {
      g[best] = d;
      solve();
      g[best] = 0;
      if (count >= cap) return;
    }
  };
  solve();
  return count;
}

function parseMoveStr(move: string): { cell: number; digit: number; row: number; col: number } {
  const m = /r(\d+)c(\d+)=(\d)/.exec(move)!;
  return { row: Number(m[1]) - 1, col: Number(m[2]) - 1, digit: Number(m[3]), cell: 0 };
}

/** Play the whole solution into every empty cell (all correct) → a full, valid match. */
function playSolvedGame(state: SudokuState): { moves: ReplayMove[] } {
  const moves: ReplayMove[] = [];
  let s = state;
  let guard = 0;
  while (sudoku.status(s) === 'playing' && guard++ < 1000) {
    const side = sudoku.currentPlayer(s);
    // Find the first empty cell and place its solution digit (always legal + correct).
    const cell = s.board.findIndex((v) => v === null);
    const row = Math.floor(cell / s.size);
    const col = cell % s.size;
    const move = `r${row + 1}c${col + 1}=${s.solution[cell]}`;
    moves.push({ player: side, move });
    s = sudoku.applyMove(s, side, move);
  }
  return { moves };
}

describe('sudoku — generator', () => {
  for (const variantId of VARIANT_IDS) {
    const vc = SUDOKU_VARIANTS_CONFIG[variantId];
    it(`${variantId}: 200 seeds → unique solution, exact clue count, valid dimensions`, () => {
      for (let seed = 1; seed <= 200; seed++) {
        const s = stateForSeed(variantId, seed);
        expect(s.board).toHaveLength(vc.size * vc.size);
        expect(s.solution).toHaveLength(vc.size * vc.size);
        // Exact clue count.
        expect(s.givenMask.filter(Boolean)).toHaveLength(vc.clues);
        // Board is a subset of the solution.
        for (let i = 0; i < s.board.length; i++) {
          if (s.board[i] !== null) expect(s.board[i]).toBe(s.solution[i]);
        }
        // Unique solution (uniqueness is THE property the digger must preserve).
        expect(countSolutions(s, 2)).toBe(1);
      }
    });
  }

  it('is deterministic: same seed → identical puzzle', () => {
    const a = stateForSeed('classic9', 4242);
    const b = stateForSeed('classic9', 4242);
    expect(a.board).toEqual(b.board);
    expect(a.solution).toEqual(b.solution);
    expect(a.givenMask).toEqual(b.givenMask);
  });

  it('different seeds → different puzzles', () => {
    const a = stateForSeed('classic9', 1);
    const b = stateForSeed('classic9', 2);
    expect(a.board).not.toEqual(b.board);
  });

  it('the generated solution is itself a valid complete grid', () => {
    const s = stateForSeed('classic6', 99);
    const full: SudokuState = { ...s, board: s.solution.map((v) => v) };
    expect(countSolutions(full, 2)).toBe(1);
  });
});

describe('sudoku — scoring', () => {
  it('a correct digit stays and scores +1', () => {
    const s = stateForSeed('mini', 3);
    const cell = s.board.findIndex((v) => v === null);
    const rc = cellToRC(cell, s.size);
    const move = `${rc}=${s.solution[cell]}`;
    const next = sudoku.applyMove(s, 'p1', move);
    expect(next.board[cell]).toBe(s.solution[cell]);
    expect(next.scores.p1).toBe(1);
    expect(next.history.at(-1)).toMatchObject({ correct: true, player: 'p1' });
  });

  it('a consistent but WRONG digit is reverted and scores −1', () => {
    const s = stateForSeed('classic9', 7);
    // A legal move whose digit does NOT match the solution: consistent but wrong.
    const wrong = sudoku
      .legalMoves(s, 'p1')
      .map(parseMoveStr)
      .find((p) => s.solution[p.row * s.size + p.col] !== p.digit)!;
    expect(wrong).toBeDefined();
    const cell = wrong.row * s.size + wrong.col;
    const move = `r${wrong.row + 1}c${wrong.col + 1}=${wrong.digit}`;
    const next = sudoku.applyMove(s, 'p1', move);
    expect(next.board[cell]).toBeNull(); // reverted
    expect(next.scores.p1).toBe(-1);
    expect(next.history.at(-1)).toMatchObject({ correct: false });
  });

  it('rejects a rules-inconsistent move (row/column/box clash)', () => {
    const s = stateForSeed('classic9', 11);
    // Find an empty cell + a digit already present in its row.
    let thrown = false;
    outer: for (let cell = 0; cell < s.size * s.size; cell++) {
      if (s.board[cell] !== null) continue;
      const row = Math.floor(cell / s.size);
      for (let c = 0; c < s.size; c++) {
        const v = s.board[row * s.size + c];
        if (v !== null) {
          const move = `r${row + 1}c${(cell % s.size) + 1}=${v}`;
          expect(() => sudoku.applyMove(s, 'p1', move)).toThrow(/conflict/i);
          thrown = true;
          break outer;
        }
      }
    }
    expect(thrown).toBe(true);
  });

  it('turns alternate regardless of correctness', () => {
    const s = stateForSeed('mini', 5);
    expect(sudoku.currentPlayer(s)).toBe('p1');
    const cell = s.board.findIndex((v) => v === null);
    const s1 = sudoku.applyMove(s, 'p1', `${cellToRC(cell, s.size)}=${s.solution[cell]}`);
    expect(sudoku.currentPlayer(s1)).toBe('p2');
  });
});

describe('sudoku — end of game', () => {
  it('a fully solved board ends the match with the higher score winning', () => {
    const s = stateForSeed('mini', 8);
    const { moves } = playSolvedGame(s);
    let cur = s;
    for (const m of moves) cur = sudoku.applyMove(cur, m.player as PlayerSide, m.move as string);
    expect(cur.board.every((v) => v !== null)).toBe(true);
    expect(sudoku.status(cur)).not.toBe('playing');
    // p1 moves first, so with an even/odd split p1 scores ≥ p2.
    expect(cur.scores.p1).toBeGreaterThanOrEqual(cur.scores.p2);
  });

  it('the engine caps the game at 3× the starting empties', () => {
    const s = stateForSeed('classic9', 13);
    const startEmpty = s.givenMask.filter((g) => !g).length;
    const cap = 3 * startEmpty;
    // Force wrong-but-consistent moves so the board never fills — only the cap ends it.
    let cur = s;
    let guard = 0;
    while (sudoku.status(cur) === 'playing' && guard++ < cap + 5) {
      const side = sudoku.currentPlayer(cur);
      const wrong = sudoku
        .legalMoves(cur, side)
        .map(parseMoveStr)
        .find((p) => cur.solution[p.row * cur.size + p.col] !== p.digit);
      // Every empty cell always has the (correct) solution digit as a candidate;
      // most also have a wrong one. If none wrong is available, place correct.
      const chosen = wrong
        ? `r${wrong.row + 1}c${wrong.col + 1}=${wrong.digit}`
        : sudoku.legalMoves(cur, side)[0];
      cur = sudoku.applyMove(cur, side, chosen);
    }
    expect(cur.history.length).toBeLessThanOrEqual(cap);
    expect(sudoku.status(cur)).not.toBe('playing');
  });
});

describe('sudoku — parseMove cascade', () => {
  it('parses whole-string JSON', () => {
    expect(sudoku.parseMove('{"move": "r4c7=3"}', [])).toBe('r4c7=3');
  });
  it('parses embedded JSON in prose / code fences', () => {
    expect(sudoku.parseMove('Sure! ```json\n{"move":"r1c1=9"}\n```', [])).toBe('r1c1=9');
  });
  it('parses a loose r_c_=_ pattern in prose', () => {
    expect(sudoku.parseMove('I will play r 12 c 3 = 5 because…', [])).toBe('r12c3=5');
  });
  it('normalises to canonical form (drops padding/zeros)', () => {
    expect(sudoku.parseMove('{"move":"R04C07=3"}', [])).toBe('r4c7=3');
  });
  it('returns null on garbage', () => {
    expect(sudoku.parseMove('no move at all', [])).toBeNull();
  });
});

describe('sudoku — validateMove & correction (from the view)', () => {
  it('accepts a legal move and rejects clashes/occupied/out-of-range with reasons', () => {
    const s = stateForSeed('classic9', 21);
    const view = sudoku.viewFor(s, 'p1');
    const emptyCell = s.board.findIndex((v) => v === null);
    const good = `${cellToRC(emptyCell, s.size)}=${s.solution[emptyCell]}`;
    expect(sudoku.validateMove!(view, good)).toEqual({ ok: true });

    // Occupied (a given).
    const givenCell = s.givenMask.findIndex(Boolean);
    expect(sudoku.validateMove!(view, `${cellToRC(givenCell, s.size)}=1`).ok).toBe(false);

    // Out-of-board coordinate.
    expect(sudoku.validateMove!(view, `r99c1=1`).ok).toBe(false);

    // Malformed move.
    expect(sudoku.validateMove!(view, `not-a-move`).ok).toBe(false);
  });

  it('renderCorrection includes the reason but NEVER a candidate/legal list', () => {
    const s = stateForSeed('classic9', 22);
    const view = sudoku.viewFor(s, 'p1');
    const rej = sudoku.validateMove!(view, 'r99c1=1');
    expect(rej.ok).toBe(false);
    if (rej.ok) throw new Error('unreachable');
    const msg = sudoku.renderCorrection!(view, rej);
    expect(msg).toContain(rej.reason);
    // The message may echo the single rejected move, but must NOT enumerate a
    // list of candidates/legal moves (plan §4.4).
    const moveTokens = msg.match(/r\d+c\d+=\d/g) ?? [];
    expect(moveTokens.length).toBeLessThanOrEqual(1);
    expect(msg.toLowerCase()).not.toContain('candidate');
  });
});

describe('sudoku — prompt (no candidate leak)', () => {
  it('renders the board + scoring but never lists candidates or the solution', () => {
    const s = stateForSeed('classic9', 30);
    const view = sudoku.viewFor(s, 'p1');
    const { system } = sudoku.renderPrompt(view, sudoku.legalMoves(s, 'p1'));
    expect(system).toContain('Sudoku Duel');
    expect(system).toContain('unique solution');
    // The prompt must not enumerate candidates or legal moves (plan §4.4).
    expect(system.toLowerCase()).not.toContain('legal moves');
    expect(system.toLowerCase()).not.toContain('candidates');
    // At most ONE example move ("r4c7=3") — never a per-cell list.
    const moveTokens = system.match(/r\d+c\d+=\d/g) ?? [];
    expect(moveTokens.length).toBeLessThanOrEqual(1);
  });

  it('reasoning mode adds a deduction hint but still no candidate list', () => {
    const s = stateForSeed('mini', 2);
    const view = sudoku.viewFor(s, 'p1');
    const { system } = sudoku.renderPrompt(view, [], { reasoning: true });
    expect(system.toLowerCase()).toContain('candidate'); // "a cell with exactly one candidate"
    // …but no per-cell enumeration: the word appears in the hint, not as a list.
    expect(system.toLowerCase()).not.toContain('legal moves');
  });
});

describe('sudoku — view hides the solution', () => {
  it('the serialized view carries no solution and reveals only the givens at start', () => {
    const s = stateForSeed('classic9', 40);
    const view = sudoku.viewFor(s, 'p1');
    expect('solution' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('solution');
    // At the start the board reveals exactly the clues — not the whole solution.
    const revealed = view.board.filter((v) => v !== null).length;
    expect(revealed).toBe(SUDOKU_VARIANTS_CONFIG.classic9.clues);
  });

  it('both sides see the same board (full information between players)', () => {
    const s = stateForSeed('classic6', 50);
    expect(sudoku.viewFor(s, 'p1').board).toEqual(sudoku.viewFor(s, 'p2').board);
  });
});

describe('sudoku — evaluateMove (analysis)', () => {
  it('classifies a wrong digit as a blunder', () => {
    const s = stateForSeed('classic9', 60);
    const wrong = sudoku
      .legalMoves(s, 'p1')
      .map(parseMoveStr)
      .find((p) => s.solution[p.row * s.size + p.col] !== p.digit)!;
    const move = `r${wrong.row + 1}c${wrong.col + 1}=${wrong.digit}`;
    expect(sudoku.evaluateMove!(s, 'p1', move).quality).toBe('blunder');
  });

  it('classifies a forced correct digit (single) as optimal', () => {
    const s = stateForSeed('classic9', 61);
    // Find a cell that is a naked single, place its solution digit.
    const size = s.size;
    const grid = s.board.map((v) => v ?? 0);
    const boxesPerRow = size / s.boxCols;
    const boxOf = (cell: number): number =>
      Math.floor(Math.floor(cell / size) / s.boxRows) * boxesPerRow +
      Math.floor((cell % size) / s.boxCols);
    const clash = (cell: number, d: number): boolean => {
      const row = Math.floor(cell / size);
      const col = cell % size;
      for (let c = 0; c < size; c++) if (grid[row * size + c] === d) return true;
      for (let r = 0; r < size; r++) if (grid[r * size + col] === d) return true;
      const b = boxOf(cell);
      for (let rc = 0; rc < size * size; rc++) if (grid[rc] === d && boxOf(rc) === b) return true;
      return false;
    };
    let nakedCell = -1;
    for (let cell = 0; cell < size * size && nakedCell < 0; cell++) {
      if (s.board[cell] !== null) continue;
      let cands = 0;
      for (let d = 1; d <= size; d++) if (!clash(cell, d)) cands++;
      if (cands === 1) nakedCell = cell;
    }
    // Most generated puzzles at 34 clues have at least one naked single; if not, skip.
    if (nakedCell >= 0) {
      const move = `${cellToRC(nakedCell, size)}=${s.solution[nakedCell]}`;
      expect(sudoku.evaluateMove!(s, 'p1', move).quality).toBe('optimal');
    }
  });
});

describe('sudoku — replay', () => {
  it('accepts a full legitimate game and reports a winner/draw', () => {
    const s = stateForSeed('mini', 70);
    const { moves } = playSolvedGame(s);
    const result = replayMatch('sudoku', 'mini', { game: 'sudoku', variant: 'mini', seed: 70 }, moves);
    expect(result.valid).toBe(true);
    expect(result.status).not.toBe('playing');
    expect(result.moveCount).toBe(moves.length);
  });

  it('rejects a rules-inconsistent move during replay', () => {
    const s = stateForSeed('classic9', 71);
    const { moves } = playSolvedGame(s);
    // Corrupt the second move into a guaranteed clash: reuse the first move's digit
    // in a cell in the same row.
    const first = parseMoveStr(moves[0].move as string);
    const clashCol = (first.col + 1) % s.size;
    const corrupted: ReplayMove[] = [
      moves[0],
      { player: 'p2', move: `r${first.row + 1}c${clashCol + 1}=${first.digit}` },
    ];
    const result = replayMatch(
      'sudoku',
      'classic9',
      { game: 'sudoku', variant: 'classic9', seed: 71 },
      corrupted,
    );
    expect(result.valid).toBe(false);
  });
});
