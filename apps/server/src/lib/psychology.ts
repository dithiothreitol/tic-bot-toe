import { type GameId, type Move, coordToCell } from '@arena/game-core';

/**
 * Model psychology (Module C, plan „efekt wow" §5) — turns a subject's saved
 * matches into behavioural distributions: where it opens, where it fires. Pure
 * and DB-free so it is unit-testable; the route (`routes/psychology.ts`) does the
 * query + cache and hands the rows here.
 *
 * Scope (Etap 6, see DECISIONS): tic-tac-toe and battleship only — the two games
 * `ModelCardPage`/`ComparePage` expose. Both aggregate straight from the stored
 * wire moves, no server replay. Scrabble/sudoku are deferred (scrabble has no UI
 * slot on the card yet; sudoku „correctness" is not in the wire move — it needs a
 * full replay against the puzzle solution).
 */

/** One saved match, reduced to what the aggregators need. */
export interface PsychologyMatch {
  p1Id: string;
  p2Id: string;
  winner: 'p1' | 'p2' | 'draw' | null;
  moves: { player: 'p1' | 'p2'; move: Move }[];
}

export interface TicTacToePsychology {
  game: 'tictactoe';
  /** Matches the subject took part in (the sample size behind every count). */
  n: number;
  /** How often the subject OPENED on each cell 0-8 (only its own first move). */
  firstMoveCounts: number[];
  /** Of those openings, how many the subject went on to WIN — the win-rate numerator. */
  firstMoveWins: number[];
  /** Every move the subject played, by cell 0-8 — its overall footprint. */
  moveCounts: number[];
}

export interface BattleshipPsychology {
  game: 'battleship';
  n: number;
  /** Board edge N (grid is N×N) — fixes the length of the arrays below. */
  size: number;
  /** Every shot the subject fired, by cell (row-major, length N²). */
  shotCounts: number[];
  /** Only the subject's FIRST shot of each match — its opening instinct. */
  firstShotCounts: number[];
}

export type PsychologyPayload = TicTacToePsychology | BattleshipPsychology;

/** Which side is our subject in this match (null if it isn't in it — a query guard). */
function subjectSide(m: PsychologyMatch, subjectId: string): 'p1' | 'p2' | null {
  if (m.p1Id === subjectId) return 'p1';
  if (m.p2Id === subjectId) return 'p2';
  return null;
}

/** tic-tac-toe move is a raw cell index; tolerate a stringified one from jsonb. */
function ticTacToeCell(move: Move): number | null {
  const cell = typeof move === 'number' ? move : Number(move);
  return Number.isInteger(cell) && cell >= 0 && cell < 9 ? cell : null;
}

export function aggregateTicTacToe(
  matches: PsychologyMatch[],
  subjectId: string,
): TicTacToePsychology {
  const firstMoveCounts = new Array<number>(9).fill(0);
  const firstMoveWins = new Array<number>(9).fill(0);
  const moveCounts = new Array<number>(9).fill(0);
  let n = 0;

  for (const m of matches) {
    const side = subjectSide(m, subjectId);
    if (!side) continue;
    n += 1;

    const own = m.moves.filter((x) => x.player === side);
    for (const mv of own) {
      const cell = ticTacToeCell(mv.move);
      if (cell !== null) moveCounts[cell] += 1;
    }

    const first = own[0];
    if (first) {
      const cell = ticTacToeCell(first.move);
      if (cell !== null) {
        firstMoveCounts[cell] += 1;
        if (m.winner === side) firstMoveWins[cell] += 1;
      }
    }
  }

  return { game: 'tictactoe', n, firstMoveCounts, firstMoveWins, moveCounts };
}

export function aggregateBattleship(
  matches: PsychologyMatch[],
  subjectId: string,
  size: number,
): BattleshipPsychology {
  const cells = size * size;
  const shotCounts = new Array<number>(cells).fill(0);
  const firstShotCounts = new Array<number>(cells).fill(0);
  let n = 0;

  for (const m of matches) {
    const side = subjectSide(m, subjectId);
    if (!side) continue;
    n += 1;

    const own = m.moves.filter((x) => x.player === side);
    let firstDone = false;
    for (const mv of own) {
      // Battleship moves are coordinate strings ("C5"); coordToCell rejects
      // anything off-board or malformed → we simply skip it.
      const cell = typeof mv.move === 'string' ? coordToCell(mv.move, size) : null;
      if (cell === null || cell < 0 || cell >= cells) continue;
      shotCounts[cell] += 1;
      if (!firstDone) {
        firstShotCounts[cell] += 1;
        firstDone = true;
      }
    }
  }

  return { game: 'battleship', n, size, shotCounts, firstShotCounts };
}

/** Games Module C can render today. Others get a `null` payload (empty state). */
export function psychologySupported(game: GameId): game is 'tictactoe' | 'battleship' {
  return game === 'tictactoe' || game === 'battleship';
}
