import { type Premium, premiumAt } from '@arena/game-core';
import type { PlacedTile } from '@arena/game-core';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const SIZE = 15;
const COLS = 'ABCDEFGHIJKLMNO';

interface PendingTile {
  letter: string;
  isBlank: boolean;
}

interface ScrabbleBoardProps {
  board: (PlacedTile | null)[];
  /** Tiles the human is composing but hasn't submitted, keyed by cell. */
  pending?: Map<number, PendingTile>;
  /** Cells of the most recent move — glow-highlighted. */
  lastCells?: number[];
  interactive?: boolean;
  onCellClick?: (cell: number) => void;
  startCell?: number | null;
  className?: string;
}

const PREMIUM_CLASS: Record<Premium, string> = {
  tw: 'bg-danger/25 text-danger',
  dw: 'bg-p2/20 text-p2',
  center: 'bg-p2/25 text-p2',
  tl: 'bg-p1/25 text-p1',
  dl: 'bg-p1/12 text-p1/80',
  none: 'text-faint',
};

const PREMIUM_LABEL: Record<Premium, string> = {
  tw: '3W',
  dw: '2W',
  center: '★',
  tl: '3L',
  dl: '2L',
  none: '',
};

/** 15×15 word-game board (plan §7.3): premium squares in colour, tiles show their value. */
export function ScrabbleBoard({
  board,
  pending,
  lastCells = [],
  interactive = false,
  onCellClick,
  startCell = null,
  className,
}: ScrabbleBoardProps) {
  const t = useT();
  const last = new Set(lastCells);
  return (
    <div
      role="grid"
      aria-label={t.scrabble.boardLabel}
      className={cn('mx-auto grid w-full max-w-[32rem] gap-px border border-border bg-border', className)}
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
    >
      {board.map((placed, cell) => {
        const row = Math.floor(cell / SIZE);
        const col = cell % SIZE;
        const tile = placed ?? (pending?.get(cell) ? { ...pending.get(cell)!, points: 0 } : null);
        const isPending = !placed && pending?.has(cell);
        const premium = premiumAt(cell);
        const canClick = interactive && onCellClick !== undefined;
        return (
          <button
            // eslint-disable-next-line react/no-array-index-key
            key={cell}
            type="button"
            disabled={!canClick}
            aria-label={t.scrabble.cell(COLS[col], row + 1, tile ? tile.letter : null)}
            onClick={canClick ? () => onCellClick?.(cell) : undefined}
            className={cn(
              'relative flex aspect-square items-center justify-center bg-card-inset font-mono text-[10px] font-bold leading-none sm:text-xs',
              !tile && PREMIUM_CLASS[premium],
              tile && !isPending && 'bg-edu/20 text-foreground',
              isPending && 'bg-edu/40 text-foreground ring-1 ring-edu',
              last.has(cell) && 'ring-1 ring-edu',
              startCell === cell && 'ring-2 ring-p1',
              canClick && 'cursor-pointer hover:bg-p1/15',
            )}
          >
            {tile ? (
              <>
                <span className={cn(tile.isBlank && 'text-p2')}>{tile.letter}</span>
              </>
            ) : (
              <span className="opacity-70">{PREMIUM_LABEL[premium]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
