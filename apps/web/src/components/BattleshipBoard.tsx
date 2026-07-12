import type {
  BattleshipOwnCell,
  BattleshipTrackingCell,
} from '@arena/game-core';

import { cn } from '@/lib/utils';

const COLS = 'ABCDEFGHIJ';

type Accent = 'p1' | 'p2';

interface BattleshipBoardProps {
  size: number;
  title: string;
  accent: Accent;
  /** 'own' renders ownBoard cells, 'tracking' renders trackingBoard cells. */
  variant: 'own' | 'tracking';
  cells: BattleshipOwnCell[] | BattleshipTrackingCell[];
  /** Coordinate strings the player may fire at (tracking + interactive only). */
  interactive?: string[];
  onFire?: (coord: string) => void;
}

function ownCellClass(cell: BattleshipOwnCell, accent: Accent): string {
  switch (cell) {
    case 'ship':
      return accent === 'p1' ? 'bg-p1/40' : 'bg-p2/40';
    case 'ship-hit':
      return 'bg-destructive/70 text-destructive-foreground';
    case 'miss':
      return 'bg-muted';
    default:
      return 'bg-card/40';
  }
}

function ownCellGlyph(cell: BattleshipOwnCell): string {
  return cell === 'ship-hit' ? '✷' : cell === 'miss' ? '·' : '';
}

function trackingCellClass(cell: BattleshipTrackingCell, accent: Accent): string {
  switch (cell) {
    case 'hit':
      return 'bg-destructive/60 text-destructive-foreground';
    case 'sunk':
      return 'bg-destructive text-destructive-foreground';
    case 'miss':
      return 'bg-muted text-muted-foreground';
    default:
      return accent === 'p1' ? 'bg-card/40 hover:bg-p1/20' : 'bg-card/40 hover:bg-p2/20';
  }
}

function trackingCellGlyph(cell: BattleshipTrackingCell): string {
  return cell === 'hit' ? 'H' : cell === 'sunk' ? 'S' : cell === 'miss' ? 'M' : '';
}

/**
 * Shot feedback (SPEC §7.4). The class lands on the cell the moment it takes
 * its new state, so the animation fires exactly once per shot.
 */
function cellFx(cell: BattleshipOwnCell | BattleshipTrackingCell): string {
  switch (cell) {
    case 'miss':
      return 'fx-splash';
    case 'hit':
    case 'ship-hit':
      return 'fx-hit';
    case 'sunk':
      return 'fx-sunk';
    default:
      return '';
  }
}

export function BattleshipBoard({
  size,
  title,
  accent,
  variant,
  cells,
  interactive = [],
  onFire,
}: BattleshipBoardProps) {
  const clickable = new Set(interactive);
  const coordOf = (r: number, c: number): string => `${COLS[c]}${r + 1}`;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          'text-[11px] font-medium uppercase tracking-wide',
          accent === 'p1' ? 'text-p1' : 'text-p2',
        )}
      >
        {title}
      </div>
      <div
        className="inline-grid gap-0.5"
        style={{
          gridTemplateColumns: `1rem repeat(${size}, minmax(1.25rem, 1.75rem))`,
        }}
      >
        <div aria-hidden />
        {Array.from({ length: size }, (_, c) => (
          <div
            key={`h-${c}`}
            className="flex items-center justify-center text-[9px] text-muted-foreground"
          >
            {COLS[c]}
          </div>
        ))}
        {Array.from({ length: size }, (_, r) => (
          <div key={`r-${r}`} className="contents">
            <div className="flex items-center justify-center text-[9px] text-muted-foreground">
              {r + 1}
            </div>
            {Array.from({ length: size }, (_, c) => {
              const idx = r * size + c;
              const coord = coordOf(r, c);
              const cell = cells[idx];
              const canClick =
                variant === 'tracking' && clickable.has(coord) && onFire !== undefined;
              const className =
                variant === 'own'
                  ? ownCellClass(cell as BattleshipOwnCell, accent)
                  : trackingCellClass(cell as BattleshipTrackingCell, accent);
              const glyph =
                variant === 'own'
                  ? ownCellGlyph(cell as BattleshipOwnCell)
                  : trackingCellGlyph(cell as BattleshipTrackingCell);
              return (
                <button
                  key={coord}
                  type="button"
                  disabled={!canClick}
                  aria-label={coord}
                  onClick={canClick ? () => onFire?.(coord) : undefined}
                  className={cn(
                    'relative flex aspect-square items-center justify-center border border-border/50 font-mono text-[10px] font-bold transition-colors',
                    className,
                    cellFx(cell),
                    canClick && 'cursor-pointer',
                  )}
                >
                  {glyph}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
