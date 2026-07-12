/**
 * Tic-tac-toe minimax solver (SPEC §6, §12.2). Full negamax with memoization —
 * the state space is trivial (< 6k reachable boards). Used ONLY for post-game
 * analysis and commentary (§12.2), NEVER as a player in the ranking.
 */
import type { TicTacToeCell, TicTacToeSymbol } from '../types';
import type { MoveQuality } from '../types';

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winnerOf(board: TicTacToeCell[]): TicTacToeSymbol | null {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) return v;
  }
  return null;
}

function isFull(board: TicTacToeCell[]): boolean {
  return board.every((c) => c !== null);
}

function other(sym: TicTacToeSymbol): TicTacToeSymbol {
  return sym === 'X' ? 'O' : 'X';
}

function key(board: TicTacToeCell[], toMove: TicTacToeSymbol): string {
  return board.map((c) => c ?? '.').join('') + toMove;
}

const memo = new Map<string, number>();

/**
 * Game value for the side to move under optimal play: +1 win, 0 draw, -1 loss.
 * If someone has already won, it was the opponent's move → the side to move lost.
 */
function value(board: TicTacToeCell[], toMove: TicTacToeSymbol): number {
  if (winnerOf(board) !== null) return -1;
  if (isFull(board)) return 0;

  const k = key(board, toMove);
  const cached = memo.get(k);
  if (cached !== undefined) return cached;

  const opp = other(toMove);
  let best = -Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;
    board[i] = toMove;
    const v = -value(board, opp);
    board[i] = null;
    if (v > best) best = v;
    if (best === 1) break; // can't do better than a forced win
  }
  memo.set(k, best);
  return best;
}

/** Game value of each legal move for `symbol` (from `symbol`'s perspective). */
export function ttMoveValues(
  board: TicTacToeCell[],
  symbol: TicTacToeSymbol,
): Map<number, number> {
  const opp = other(symbol);
  const work = board.slice();
  const out = new Map<number, number>();
  for (let i = 0; i < 9; i++) {
    if (work[i] !== null) continue;
    work[i] = symbol;
    out.set(i, -value(work, opp));
    work[i] = null;
  }
  return out;
}

/**
 * Classify a move by `symbol` at `cell` on `board` (§12.2):
 *  - optimal — does not worsen the game-theoretic outcome
 *  - blunder — turns a win into a draw/loss, or a draw into a loss
 *  - weak    — worsens without crossing a blunder boundary (rare in 3×3)
 */
export function classifyTicTacToeMove(
  board: TicTacToeCell[],
  cell: number,
  symbol: TicTacToeSymbol,
): MoveQuality {
  const values = ttMoveValues(board, symbol);
  const after = values.get(cell);
  if (after === undefined) return 'weak'; // illegal cell — caller should not hit this
  const best = Math.max(...values.values());
  if (after === best) return 'optimal';
  if ((best === 1 && after <= 0) || (best === 0 && after === -1)) return 'blunder';
  return 'weak';
}
