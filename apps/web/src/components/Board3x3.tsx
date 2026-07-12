import type { TicTacToeCell } from '@arena/game-core';

import { pl } from '@/i18n/pl';
import { cn } from '@/lib/utils';

interface Board3x3Props {
  board: TicTacToeCell[];
  /** Cells the current player may click. Empty ⇒ board is not interactive. */
  interactive?: number[];
  onCellClick?: (cell: number) => void;
  /** Index of the most recent move, glow-highlighted. */
  lastMove?: number | null;
  className?: string;
}

/**
 * The 3×3 board is a bespoke component (SPEC §3 overlay: shadcn is for app
 * chrome, boards are our own). P1 = X cyan, P2 = O magenta, with glow.
 */
export function Board3x3({
  board,
  interactive = [],
  onCellClick,
  lastMove = null,
  className,
}: Board3x3Props) {
  const clickable = new Set(interactive);

  return (
    <div
      role="grid"
      aria-label={pl.board.label}
      className={cn('mx-auto grid w-full max-w-80 grid-cols-3 gap-2', className)}
    >
      {board.map((mark, i) => {
        const canClick = clickable.has(i) && onCellClick !== undefined;
        return (
          <button
            // Board indices are stable identities here.
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            type="button"
            disabled={!canClick}
            aria-label={pl.board.cell(i, mark)}
            onClick={canClick ? () => onCellClick?.(i) : undefined}
            className={cn(
              'flex aspect-square min-h-11 select-none items-center justify-center',
              'rounded-lg border border-border bg-card/60 font-mono text-4xl font-bold sm:text-5xl',
              'transition-all duration-150',
              canClick &&
                'cursor-pointer hover:-translate-y-0.5 hover:border-primary/60 hover:bg-card',
              !canClick && mark === null && 'opacity-60',
              mark === 'X' && 'text-p1 text-glow-p1',
              mark === 'O' && 'text-p2 text-glow-p2',
              lastMove === i && mark === 'X' && 'glow-p1',
              lastMove === i && mark === 'O' && 'glow-p2',
            )}
          >
            {mark ?? ''}
          </button>
        );
      })}
    </div>
  );
}
