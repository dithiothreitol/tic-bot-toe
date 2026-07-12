/**
 * Tic-tac-toe engine (SPEC §6).
 *
 * Board: 3×3, cell indices 0-8 left-to-right, top-to-bottom.
 * Full information: `viewFor` returns the complete board for both sides.
 * p1 = X (moves first), p2 = O.
 */

import type {
  GameDefinition,
  GameStatus,
  PlayerSide,
  PlayerView,
  RenderedPrompt,
  SetupConfig,
  SetupRecord,
  TicTacToeCell,
  TicTacToeSymbol,
  TicTacToeView,
  Variant,
} from './types';

export interface TicTacToeState {
  variant: string;
  /** Length 9. */
  board: TicTacToeCell[];
  /** Cell indices in play order (p1, p2, p1, …). */
  moves: number[];
}

export const TICTACTOE_VARIANTS: Variant[] = [
  { id: 'standard', label: 'Klasyczne 3×3' },
];

const WINNING_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // columns
  [0, 4, 8],
  [2, 4, 6], // diagonals
];

export function symbolFor(player: PlayerSide): TicTacToeSymbol {
  return player === 'p1' ? 'X' : 'O';
}

/** Whose turn it is, derived from move count (p1/X moves first). */
export function currentTurn(state: TicTacToeState): PlayerSide {
  return state.moves.length % 2 === 0 ? 'p1' : 'p2';
}

function computeStatus(board: TicTacToeCell[]): GameStatus {
  for (const [a, b, c] of WINNING_LINES) {
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) {
      return v === 'X' ? 'p1_won' : 'p2_won';
    }
  }
  return board.every((cell) => cell !== null) ? 'draw' : 'playing';
}

function inRange(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 8;
}

function renderAsciiBoard(board: TicTacToeCell[]): string {
  const cell = (i: number): string => String(board[i] ?? i);
  const row = (a: number, b: number, c: number): string =>
    ` ${cell(a)} | ${cell(b)} | ${cell(c)}`;
  const sep = '---+---+---';
  return [row(0, 1, 2), sep, row(3, 4, 5), sep, row(6, 7, 8)].join('\n');
}

function renderOccupied(board: TicTacToeCell[]): string {
  const parts: string[] = [];
  for (let i = 0; i < 9; i++) {
    const v = board[i];
    if (v !== null) parts.push(`${i}=${v}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'none';
}

/**
 * Extract a cell index from raw model output via the SPEC §6 cascade:
 *   1) strict JSON.parse of the whole string,
 *   2) embedded `{"move": <digit>}` regex,
 *   3) first lone digit 0-8.
 * The first tier that yields an in-range integer wins. Legality is checked by
 * the caller (`parseMove`).
 */
function extractCell(raw: string): number | null {
  // Tier 1: whole response is JSON.
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj !== null && typeof obj === 'object' && 'move' in obj) {
      const n = Number((obj as Record<string, unknown>).move);
      if (inRange(n)) return n;
    }
  } catch {
    // Not pure JSON — fall through.
  }

  // Tier 2: a `{"move": d}` object embedded in prose / code fences.
  const embedded = raw.match(/\{[^}]*"move"\s*:\s*(\d)[^}]*\}/);
  if (embedded) {
    const n = Number(embedded[1]);
    if (inRange(n)) return n;
  }

  // Tier 3: first standalone digit 0-8 (not part of a multi-digit number).
  const lone = raw.match(/(?<!\d)[0-8](?!\d)/);
  if (lone) return Number(lone[0]);

  return null;
}

function renderUserMessage(view: TicTacToeView): string {
  if (view.moveHistory.length === 0) {
    return 'You move first. Make your move.';
  }
  return `Move history (cells, oldest first): ${view.moveHistory.join(', ')}. Your move.`;
}

function asTicTacToeView(view: PlayerView): TicTacToeView {
  if (view.game !== 'tictactoe') {
    throw new Error(`Expected tictactoe view, got "${view.game}"`);
  }
  return view;
}

export const ticTacToe: GameDefinition<TicTacToeState, number, TicTacToeView> = {
  id: 'tictactoe',
  variants: TICTACTOE_VARIANTS,

  createInitialState(variant: Variant, _config: SetupConfig): TicTacToeState {
    return {
      variant: variant.id,
      board: Array<TicTacToeCell>(9).fill(null),
      moves: [],
    };
  },

  currentPlayer(state: TicTacToeState): PlayerSide {
    return currentTurn(state);
  },

  legalMoves(state: TicTacToeState, player: PlayerSide): number[] {
    if (computeStatus(state.board) !== 'playing') return [];
    if (currentTurn(state) !== player) return [];
    const out: number[] = [];
    for (let i = 0; i < 9; i++) {
      if (state.board[i] === null) out.push(i);
    }
    return out;
  },

  applyMove(state: TicTacToeState, player: PlayerSide, move: number): TicTacToeState {
    if (computeStatus(state.board) !== 'playing') {
      throw new Error('Cannot move: game is already over');
    }
    if (currentTurn(state) !== player) {
      throw new Error(`Cannot move: it is not ${player}'s turn`);
    }
    if (!inRange(move)) {
      throw new Error(`Illegal move: cell ${move} is out of range 0-8`);
    }
    if (state.board[move] !== null) {
      throw new Error(`Illegal move: cell ${move} is occupied`);
    }
    const board = state.board.slice();
    board[move] = symbolFor(player);
    return {
      variant: state.variant,
      board,
      moves: [...state.moves, move],
    };
  },

  status(state: TicTacToeState): GameStatus {
    return computeStatus(state.board);
  },

  viewFor(state: TicTacToeState, player: PlayerSide): TicTacToeView {
    return {
      game: 'tictactoe',
      variant: state.variant,
      side: player,
      status: computeStatus(state.board),
      moveNumber: state.moves.length,
      moveHistory: [...state.moves],
      board: state.board.slice(),
      symbol: symbolFor(player),
    };
  },

  renderPrompt(view: PlayerView, legal: number[]): RenderedPrompt {
    const v = asTicTacToeView(view);
    const system = [
      `You are playing tic-tac-toe. You play as ${v.symbol}.`,
      `The board uses cell indices 0-8 (left-to-right, top-to-bottom).`,
      `Current board:`,
      renderAsciiBoard(v.board),
      `Occupied cells: ${renderOccupied(v.board)}`,
      `Legal moves: ${legal.join(', ')}`,
      `Respond with ONLY a JSON object: {"move": <cell_index>}`,
      `No explanation, no markdown, no code fences.`,
    ].join('\n');
    return { system, user: renderUserMessage(v) };
  },

  parseMove(raw: string, legal: number[]): number | null {
    const candidate = extractCell(raw);
    if (candidate === null) return null;
    return legal.includes(candidate) ? candidate : null;
  },

  serializeSetup(state: TicTacToeState): SetupRecord {
    return { game: 'tictactoe', variant: state.variant };
  },
};
