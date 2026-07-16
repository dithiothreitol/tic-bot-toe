/**
 * Sudoku Duel engine (plan §4).
 *
 * A TWO-PLAYER game, not a solo puzzle: the arena is inherently p1-vs-p2. Both
 * sides alternately place one digit on a SHARED board that has a unique
 * solution. A digit matching the solution stays and scores +1; a rules-
 * consistent but WRONG digit scores −1 and is immediately removed. The board is
 * therefore always a subset of the solution ⇒ every empty cell keeps at least
 * one legal move ⇒ the runner's `legal.length === 0` guard never fires.
 *
 * Hidden information: `viewFor` returns the full board to BOTH sides (there are
 * no secrets between players) but NEVER the solution — leaking it, or the
 * per-cell candidate list, would hand the model the answer. Enforced by a
 * snapshot test.
 *
 * Coordinates: wire move is a string "r4c7=3" — 1-indexed row/col, digit 1..N.
 * Internally cells are 0-indexed row-major: cell = (row-1)*size + (col-1).
 */

import { mulberry32 } from './rng';
import type {
  GameDefinition,
  GameStatus,
  MoveEval,
  MoveRejection,
  MoveValidation,
  PlayerSide,
  PlayerView,
  PromptOptions,
  RenderedPrompt,
  SetupConfig,
  SudokuAnnotatedEntry,
  SudokuView,
  Variant,
} from './types';

export interface SudokuVariantConfig {
  id: string;
  label: string;
  size: number;
  boxRows: number;
  boxCols: number;
  /** Number of starting clues (givens). */
  clues: number;
}

export const SUDOKU_VARIANTS_CONFIG: Record<string, SudokuVariantConfig> = {
  mini: { id: 'mini', label: 'Mini 4×4', size: 4, boxRows: 2, boxCols: 2, clues: 6 },
  classic6: { id: 'classic6', label: 'Klasyczne 6×6', size: 6, boxRows: 2, boxCols: 3, clues: 14 },
  classic9: { id: 'classic9', label: 'Klasyczne 9×9', size: 9, boxRows: 3, boxCols: 3, clues: 34 },
};

export const SUDOKU_VARIANTS: Variant[] = Object.values(SUDOKU_VARIANTS_CONFIG).map((v) => ({
  id: v.id,
  label: v.label,
}));

export function getSudokuVariant(id: string): SudokuVariantConfig {
  const vc = SUDOKU_VARIANTS_CONFIG[id];
  if (!vc) throw new Error(`Unknown sudoku variant: ${id}`);
  return vc;
}

export interface SudokuHistoryEntry {
  player: PlayerSide;
  /** 0-indexed cell. */
  cell: number;
  digit: number;
  correct: boolean;
}

export interface SudokuState {
  variant: string;
  size: number;
  boxRows: number;
  boxCols: number;
  seed: number;
  /** Length size², NEVER exposed in the view. */
  solution: number[];
  /** Current board, row-major; null = empty. Always a subset of `solution`. */
  board: (number | null)[];
  /** Starting clues (immutable), row-major. */
  givenMask: boolean[];
  scores: { p1: number; p2: number };
  history: SudokuHistoryEntry[];
}

// --------------------------------------------------------------------------
// Coordinates + grid helpers
// --------------------------------------------------------------------------

/** "r4c7" (1-indexed) for a 0-indexed cell. */
export function cellToRC(cell: number, size: number): string {
  const row = Math.floor(cell / size);
  const col = cell % size;
  return `r${row + 1}c${col + 1}`;
}

interface ParsedMove {
  row: number; // 0-indexed
  col: number; // 0-indexed
  digit: number;
  cell: number;
}

/** Parse "rRcC=D" (loose, 1-indexed) into 0-indexed coordinates; null if malformed. */
function parseMoveString(move: string, size: number): ParsedMove | null {
  const m = /r\s*(\d{1,2})\s*c\s*(\d{1,2})\s*=\s*(\d)/i.exec(move);
  if (!m) return null;
  const row = Number(m[1]) - 1;
  const col = Number(m[2]) - 1;
  const digit = Number(m[3]);
  return { row, col, digit, cell: row * size + col };
}

/** Canonical wire form. */
function canonicalMove(row: number, col: number, digit: number): string {
  return `r${row + 1}c${col + 1}=${digit}`;
}

function boxIndex(cell: number, size: number, boxRows: number, boxCols: number): number {
  const row = Math.floor(cell / size);
  const col = cell % size;
  const boxesPerRow = size / boxCols;
  return Math.floor(row / boxRows) * boxesPerRow + Math.floor(col / boxCols);
}

/** Whether digit `d` would clash with row/col/box on `grid` (0 = empty), ignoring `cell` itself. */
function conflicts(
  grid: number[],
  cell: number,
  d: number,
  size: number,
  boxRows: number,
  boxCols: number,
): boolean {
  const row = Math.floor(cell / size);
  const col = cell % size;
  for (let c = 0; c < size; c++) {
    const rc = row * size + c;
    if (rc !== cell && grid[rc] === d) return true;
  }
  for (let r = 0; r < size; r++) {
    const rc = r * size + col;
    if (rc !== cell && grid[rc] === d) return true;
  }
  const box = boxIndex(cell, size, boxRows, boxCols);
  for (let rc = 0; rc < size * size; rc++) {
    if (rc !== cell && grid[rc] === d && boxIndex(rc, size, boxRows, boxCols) === box) return true;
  }
  return false;
}

function candidates(
  grid: number[],
  cell: number,
  size: number,
  boxRows: number,
  boxCols: number,
): number[] {
  const out: number[] = [];
  for (let d = 1; d <= size; d++) {
    if (!conflicts(grid, cell, d, size, boxRows, boxCols)) out.push(d);
  }
  return out;
}

/** Board as a numeric grid (null → 0), for conflict/candidate math. */
function toGrid(board: (number | null)[]): number[] {
  return board.map((v) => v ?? 0);
}

// --------------------------------------------------------------------------
// Generation (seeded, deterministic)
// --------------------------------------------------------------------------

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A full valid grid via backtracking with a seeded digit order. */
function generateSolution(size: number, boxRows: number, boxCols: number, rng: () => number): number[] {
  const grid = new Array<number>(size * size).fill(0);
  const digits = Array.from({ length: size }, (_, i) => i + 1);

  const fill = (pos: number): boolean => {
    if (pos === size * size) return true;
    if (grid[pos] !== 0) return fill(pos + 1);
    for (const d of shuffle(digits, rng)) {
      if (!conflicts(grid, pos, d, size, boxRows, boxCols)) {
        grid[pos] = d;
        if (fill(pos + 1)) return true;
        grid[pos] = 0;
      }
    }
    return false;
  };

  fill(0);
  return grid;
}

/**
 * Count solutions of `grid` (0 = empty) up to `cap`, using MRV (fill the cell
 * with the fewest candidates first) so uniqueness checks stay fast even on 9×9.
 */
function countSolutions(
  grid: number[],
  size: number,
  boxRows: number,
  boxCols: number,
  cap: number,
): number {
  const g = [...grid];
  let count = 0;

  const solve = (): void => {
    if (count >= cap) return;
    let best = -1;
    let bestCands: number[] | null = null;
    for (let pos = 0; pos < g.length; pos++) {
      if (g[pos] !== 0) continue;
      const cands = candidates(g, pos, size, boxRows, boxCols);
      if (cands.length === 0) return; // dead end
      if (bestCands === null || cands.length < bestCands.length) {
        best = pos;
        bestCands = cands;
        if (cands.length === 1) break;
      }
    }
    if (best === -1) {
      count += 1; // no empty cell left → a complete solution
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

/** Remove clues in seeded order while the solution stays unique, until `clues` remain. */
function digHoles(
  solution: number[],
  size: number,
  boxRows: number,
  boxCols: number,
  clues: number,
  rng: () => number,
): { board: (number | null)[]; givenMask: boolean[] } {
  const puzzle = [...solution];
  const removalsTarget = size * size - clues;
  let removed = 0;
  for (const cell of shuffle(
    Array.from({ length: size * size }, (_, i) => i),
    rng,
  )) {
    if (removed >= removalsTarget) break;
    const backup = puzzle[cell];
    puzzle[cell] = 0;
    if (countSolutions(puzzle, size, boxRows, boxCols, 2) === 1) {
      removed += 1;
    } else {
      puzzle[cell] = backup; // removing it would make the puzzle ambiguous
    }
  }
  return {
    board: puzzle.map((v) => (v === 0 ? null : v)),
    givenMask: puzzle.map((v) => v !== 0),
  };
}

// --------------------------------------------------------------------------
// Status + limits
// --------------------------------------------------------------------------

/** Hard cap on total moves: 3× the empty cells at start (plan §4.2b) — kills endless guessing. */
function maxMoves(state: SudokuState): number {
  const startEmpty = state.givenMask.filter((g) => !g).length;
  return 3 * startEmpty;
}

function computeStatus(state: SudokuState): GameStatus {
  const full = state.board.every((c) => c !== null);
  const exhausted = state.history.length >= maxMoves(state);
  if (!full && !exhausted) return 'playing';
  if (state.scores.p1 > state.scores.p2) return 'p1_won';
  if (state.scores.p2 > state.scores.p1) return 'p2_won';
  return 'draw';
}

function currentTurn(state: SudokuState): PlayerSide {
  return state.history.length % 2 === 0 ? 'p1' : 'p2';
}

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------

function asSudokuView(view: PlayerView): SudokuView {
  if (view.game !== 'sudoku') {
    throw new Error(`Expected sudoku view, got "${view.game}"`);
  }
  return view;
}

/** ASCII grid with r/c coordinates and box separators; '.' for empty cells. */
function renderAsciiGrid(
  board: (number | null)[],
  size: number,
  boxRows: number,
  boxCols: number,
): string {
  const cellW = String(size).length; // 1 for ≤9
  const pad = (s: string): string => s.padStart(cellW, ' ');
  const rowLabelW = `r${size}`.length;
  const blank = ' '.repeat(rowLabelW);

  // Column header.
  const header: string[] = [blank];
  for (let c = 0; c < size; c++) {
    if (c > 0 && c % boxCols === 0) header.push('|');
    header.push(pad(`c${c + 1}`));
  }
  const lines = [header.join(' ')];

  for (let r = 0; r < size; r++) {
    if (r > 0 && r % boxRows === 0) {
      // Box-row separator sized to the header width.
      lines.push('-'.repeat(lines[0].length));
    }
    const cells: string[] = [`r${r + 1}`.padEnd(rowLabelW, ' ')];
    for (let c = 0; c < size; c++) {
      if (c > 0 && c % boxCols === 0) cells.push('|');
      const v = board[r * size + c];
      cells.push(pad(v === null ? '.' : String(v)));
    }
    lines.push(cells.join(' '));
  }
  return lines.join('\n');
}

/** Recent placements as "r4c7=3 OK(+1)" / "r4c7=3 WRONG(-1)". */
function renderRecent(history: SudokuAnnotatedEntry[]): string {
  if (history.length === 0) return 'none yet';
  return history
    .slice(-6)
    .map((h) => `${h.cell}=${h.digit} ${h.correct ? 'OK(+1)' : 'WRONG(-1)'}`)
    .join(', ');
}

// --------------------------------------------------------------------------
// Analysis (SPEC §12.2) — feeds the "Precyzja" column
// --------------------------------------------------------------------------

/** Was `digit` forced at `cell` on `grid` (naked single OR hidden single in some unit)? */
function isForced(
  grid: number[],
  cell: number,
  digit: number,
  size: number,
  boxRows: number,
  boxCols: number,
): boolean {
  // Naked single: the cell itself admits exactly one candidate.
  if (candidates(grid, cell, size, boxRows, boxCols).length === 1) return true;

  // Hidden single: `digit` has exactly one legal home in the cell's row, column or box.
  const row = Math.floor(cell / size);
  const col = cell % size;
  const box = boxIndex(cell, size, boxRows, boxCols);

  const onlyHomeIn = (cells: number[]): boolean => {
    let homes = 0;
    for (const rc of cells) {
      if (grid[rc] === 0 && !conflicts(grid, rc, digit, size, boxRows, boxCols)) homes += 1;
    }
    return homes === 1;
  };

  const rowCells = Array.from({ length: size }, (_, c) => row * size + c);
  const colCells = Array.from({ length: size }, (_, r) => r * size + col);
  const boxCells: number[] = [];
  for (let rc = 0; rc < size * size; rc++) {
    if (boxIndex(rc, size, boxRows, boxCols) === box) boxCells.push(rc);
  }
  return onlyHomeIn(rowCells) || onlyHomeIn(colCells) || onlyHomeIn(boxCells);
}

// --------------------------------------------------------------------------
// Engine
// --------------------------------------------------------------------------

export const sudoku: GameDefinition<SudokuState, string, SudokuView> = {
  id: 'sudoku',
  variants: SUDOKU_VARIANTS,

  createInitialState(variant: Variant, config: SetupConfig): SudokuState {
    const vc = getSudokuVariant(variant.id);
    const seed = config.seed ?? 1;
    const rng = mulberry32(seed);
    const solution = generateSolution(vc.size, vc.boxRows, vc.boxCols, rng);
    const { board, givenMask } = digHoles(solution, vc.size, vc.boxRows, vc.boxCols, vc.clues, rng);
    return {
      variant: variant.id,
      size: vc.size,
      boxRows: vc.boxRows,
      boxCols: vc.boxCols,
      seed,
      solution,
      board,
      givenMask,
      scores: { p1: 0, p2: 0 },
      history: [],
    };
  },

  currentPlayer(state: SudokuState): PlayerSide {
    return currentTurn(state);
  },

  legalMoves(state: SudokuState, player: PlayerSide): string[] {
    if (computeStatus(state) !== 'playing' || currentTurn(state) !== player) return [];
    // Full enumeration (empty cell × non-conflicting candidate). Used by the
    // default forfeit path and by tests — NEVER surfaced in the prompt/correction
    // (that would reveal candidates). At least the solution digit is always a
    // candidate for every empty cell, so this is never empty mid-game.
    const grid = toGrid(state.board);
    const out: string[] = [];
    for (let cell = 0; cell < state.size * state.size; cell++) {
      if (state.board[cell] !== null) continue;
      const row = Math.floor(cell / state.size);
      const col = cell % state.size;
      for (const d of candidates(grid, cell, state.size, state.boxRows, state.boxCols)) {
        out.push(canonicalMove(row, col, d));
      }
    }
    return out;
  },

  applyMove(state: SudokuState, player: PlayerSide, move: string): SudokuState {
    if (computeStatus(state) !== 'playing') {
      throw new Error('Cannot move: game is already over');
    }
    if (currentTurn(state) !== player) {
      throw new Error(`Cannot move: it is not ${player}'s turn`);
    }
    const parsed = parseMoveString(move, state.size);
    if (!parsed) throw new Error(`Illegal move: "${move}" is not a valid r_c_=_ coordinate`);
    const { row, col, digit, cell } = parsed;
    if (row < 0 || row >= state.size || col < 0 || col >= state.size) {
      throw new Error(`Illegal move: ${move} is outside the ${state.size}×${state.size} board`);
    }
    if (digit < 1 || digit > state.size) {
      throw new Error(`Illegal move: digit ${digit} out of range 1-${state.size}`);
    }
    if (state.board[cell] !== null) {
      throw new Error(`Illegal move: cell ${cellToRC(cell, state.size)} is already filled`);
    }
    const grid = toGrid(state.board);
    if (conflicts(grid, cell, digit, state.size, state.boxRows, state.boxCols)) {
      throw new Error(`Illegal move: digit ${digit} conflicts in its row, column or box`);
    }

    // A rules-consistent move is always accepted; whether it SCORES depends on
    // matching the hidden solution. Wrong → reverted (board unchanged) and −1.
    const correct = state.solution[cell] === digit;
    const board = state.board.slice();
    if (correct) board[cell] = digit;
    const scores = { ...state.scores };
    scores[player] += correct ? 1 : -1;

    return {
      ...state,
      board,
      scores,
      history: [...state.history, { player, cell, digit, correct }],
    };
  },

  status(state: SudokuState): GameStatus {
    return computeStatus(state);
  },

  viewFor(state: SudokuState, player: PlayerSide): SudokuView {
    return {
      game: 'sudoku',
      variant: state.variant,
      side: player,
      status: computeStatus(state),
      moveNumber: state.history.length,
      moveHistory: state.history.map((h) => canonicalMove(
        Math.floor(h.cell / state.size),
        h.cell % state.size,
        h.digit,
      )),
      size: state.size,
      boxRows: state.boxRows,
      boxCols: state.boxCols,
      board: state.board.slice(),
      givenMask: state.givenMask.slice(),
      scores: { ...state.scores },
      annotatedHistory: state.history.map((h) => ({
        player: h.player,
        cell: cellToRC(h.cell, state.size),
        digit: h.digit,
        correct: h.correct,
      })),
      movesRemaining: Math.max(0, maxMoves(state) - state.history.length),
    };
  },

  renderPrompt(view: PlayerView, _legal: string[], opts?: PromptOptions): RenderedPrompt {
    const v = asSudokuView(view);
    const you = v.side === 'p1' ? v.scores.p1 : v.scores.p2;
    const opp = v.side === 'p1' ? v.scores.p2 : v.scores.p1;
    const head = [
      `You are playing competitive Sudoku Duel as ${v.side}. Players alternate placing one digit.`,
      `Board ${v.size}x${v.size}, boxes ${v.boxRows}x${v.boxCols}, digits 1-${v.size}. '.' = empty cell.`,
      renderAsciiGrid(v.board, v.size, v.boxRows, v.boxCols),
      `Scoring: digit matching the unique solution = +1; a consistent but WRONG digit = -1 and it is removed.`,
      `Current score: you ${you}, opponent ${opp}. Recent placements: ${renderRecent(v.annotatedHistory)}.`,
      `Only place a digit you can DEDUCE. Cell must be empty; digit must not repeat in its row, column or box.`,
    ];
    // Reasoning mode: nudge toward deduction (singles) — but NEVER list candidates
    // (that would solve the puzzle for the model). Answer format is unchanged.
    const tail = opts?.reasoning
      ? [
          `Scan rows, columns and boxes for a cell with exactly one candidate. Think in AT MOST three short sentences.`,
          `Then, on the LAST line, output ONLY the move as a JSON object: {"move": "r4c7=3"}`,
        ]
      : [
          `Respond with ONLY a JSON object: {"move": "r4c7=3"}`,
          `No explanation, no markdown, no code fences.`,
        ];
    const user = v.moveHistory.length === 0 ? 'You move first. Make your move.' : 'Your move.';
    return { system: [...head, ...tail].join('\n'), user };
  },

  parseMove(raw: string, _legal: string[]): string | null {
    // Syntactic recovery only (plan §3) — legality is decided by `validateMove`.
    // Cascade: (1) whole-string JSON, (2) embedded `"move":"…"`, (3) loose r_c_=_.
    try {
      const obj: unknown = JSON.parse(raw);
      if (obj !== null && typeof obj === 'object' && 'move' in obj) {
        const parsed = parseMoveString(String((obj as Record<string, unknown>).move), 99);
        if (parsed) return canonicalMove(parsed.row, parsed.col, parsed.digit);
      }
    } catch {
      // not pure JSON
    }
    const embedded = raw.match(/"move"\s*:\s*"([^"]*)"/);
    if (embedded) {
      const parsed = parseMoveString(embedded[1], 99);
      if (parsed) return canonicalMove(parsed.row, parsed.col, parsed.digit);
    }
    const loose = parseMoveString(raw, 99);
    return loose ? canonicalMove(loose.row, loose.col, loose.digit) : null;
  },

  validateMove(view: PlayerView, move: string): MoveValidation {
    const v = asSudokuView(view);
    const parsed = parseMoveString(move, v.size);
    if (!parsed) return { ok: false, reason: `"${move}" is not a valid r<row>c<col>=<digit> move` };
    const { row, col, digit, cell } = parsed;
    if (row < 0 || row >= v.size || col < 0 || col >= v.size) {
      return { ok: false, reason: `${move} is outside the ${v.size}x${v.size} board` };
    }
    if (digit < 1 || digit > v.size) {
      return { ok: false, reason: `digit ${digit} is out of range 1-${v.size}` };
    }
    if (v.board[cell] !== null) {
      return { ok: false, reason: `cell ${cellToRC(cell, v.size)} is already filled` };
    }
    const grid = toGrid(v.board);
    if (conflicts(grid, cell, digit, v.size, v.boxRows, v.boxCols)) {
      return { ok: false, reason: `digit ${digit} already appears in that row, column or box` };
    }
    return { ok: true };
  },

  renderCorrection(view: PlayerView, rejection?: MoveRejection): string {
    const v = asSudokuView(view);
    // Reason + rules reminder, but NEVER the candidate list (plan §4.4).
    const why = rejection ? ` ${rejection.reason}.` : '';
    return (
      `That move was not accepted.${why} Choose an EMPTY cell and a digit 1-${v.size} that does not ` +
      `repeat in its row, column or box. Respond with ONLY a JSON object: {"move": "r<row>c<col>=<digit>"}.`
    );
  },

  evaluateMove(state: SudokuState, _player: PlayerSide, move: string): MoveEval {
    const parsed = parseMoveString(move, state.size);
    if (!parsed) return { quality: 'blunder', detail: 'unparseable move' };
    const { cell, digit } = parsed;
    const correct = state.solution[cell] === digit;
    if (!correct) return { quality: 'blunder', detail: 'wrong digit (−1)' };
    const grid = toGrid(state.board);
    const forced = isForced(grid, cell, digit, state.size, state.boxRows, state.boxCols);
    return forced
      ? { quality: 'optimal', detail: 'forced (naked/hidden single)' }
      : { quality: 'good', detail: 'correct but not forced' };
  },

  // No `fallbackMove`: the default (random legal move) is exactly what a forfeit
  // should cost here — a consistent guess, usually wrong (−1) (plan §4.4).

  serializeSetup(state: SudokuState) {
    return { game: 'sudoku' as const, variant: state.variant, seed: state.seed };
  },
};
