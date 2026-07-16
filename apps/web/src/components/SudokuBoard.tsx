import type { PlayerSide } from '@arena/game-core';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

interface SudokuBoardProps {
  size: number;
  boxRows: number;
  boxCols: number;
  board: (number | null)[];
  givenMask: boolean[];
  /** Who placed each non-given filled cell — colours the digit (P1 cyan, P2 magenta). */
  owners?: (PlayerSide | null)[];
  /** Cells the human may click (empty, non-given). Empty ⇒ board is read-only. */
  interactive?: number[];
  onCellClick?: (cell: number) => void;
  /** Currently picked cell (digit picker open) — ringed in the active accent. */
  selectedCell?: number | null;
  /** Most recent move's cell, glow-highlighted. */
  lastCell?: number | null;
  /** Override the last-cell highlight (e.g. analysis quality ring). */
  lastCellClass?: string;
  /** Live outcome of the last move: true = correct (+1), false = wrong (−1, reverted). */
  lastCorrect?: boolean;
  className?: string;
}

/**
 * Shared board for Sudoku Duel (SPEC §4 look & feel). A bespoke component like
 * the other boards: box separators are drawn with thicker borders, starting
 * clues are bold/neutral, and each placed digit is tinted by the player who
 * scored it. The solution is never known to this component — it only renders
 * what the engine's view exposes.
 */
export function SudokuBoard({
  size,
  boxRows,
  boxCols,
  board,
  givenMask,
  owners,
  interactive = [],
  onCellClick,
  selectedCell = null,
  lastCell = null,
  lastCellClass,
  lastCorrect,
  className,
}: SudokuBoardProps) {
  const t = useT();
  const clickable = new Set(interactive);

  return (
    <div
      role="grid"
      aria-label={t.sudoku.boardLabel}
      className={cn(
        'mx-auto grid w-full max-w-100 border-2 border-border bg-card-inset',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {board.map((digit, i) => {
        const row = Math.floor(i / size);
        const col = i % size;
        const given = givenMask[i];
        const owner = owners?.[i] ?? null;
        const canClick = clickable.has(i) && onCellClick !== undefined;
        // Thick internal separators on box boundaries (not the outer edge — the
        // container already has that).
        const thickRight = (col + 1) % boxCols === 0 && col !== size - 1;
        const thickBottom = (row + 1) % boxRows === 0 && row !== size - 1;
        const isLast = lastCell === i;
        return (
          <button
            // Board indices are stable identities here.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            type="button"
            disabled={!canClick}
            aria-label={t.sudoku.cell(row + 1, col + 1, digit)}
            onClick={canClick ? () => onCellClick?.(i) : undefined}
            className={cn(
              'relative flex aspect-square select-none items-center justify-center',
              'border-[0.5px] border-border-soft font-mono text-sm font-bold leading-none sm:text-base md:text-lg',
              thickRight && 'border-r-2 border-r-border',
              thickBottom && 'border-b-2 border-b-border',
              given ? 'text-foreground' : owner === 'p1' ? 'text-p1' : owner === 'p2' ? 'text-p2' : 'text-foreground/80',
              given && 'bg-border/10',
              canClick && 'cursor-pointer hover:bg-p1/10',
              selectedCell === i && 'z-10 ring-2 ring-p1',
              // Last-move highlight: explicit override wins; otherwise green for a
              // correct placement, red pulse for a reverted mistake.
              isLast && lastCellClass,
              isLast && !lastCellClass && lastCorrect === true && 'z-10 ring-2 ring-edu',
              isLast && !lastCellClass && lastCorrect === false && 'z-10 ring-2 ring-danger animate-pulse',
            )}
          >
            {digit ?? ''}
            {isLast && !lastCellClass && lastCorrect !== undefined && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute -right-1 -top-2 font-mono text-[9px] font-bold',
                  lastCorrect ? 'text-edu' : 'text-danger',
                )}
              >
                {lastCorrect ? '+1' : '−1'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
