/**
 * Mini-board glyphs for the game-select tiles (handoff/screens/01-ekran-glowny.png).
 *
 * Deliberately built from tokens + geometry, not raster art: the tiles are tiny
 * and the DESIGN rule is "czytelność ponad efekciarstwo" — crisp squares stay
 * sharp at every density, weigh nothing and follow the theme automatically.
 */
import { cn } from '@/lib/utils';

/** Board cells: a locked-in X/O position, as on the reference screen. */
const TTT_CELLS = ['p1', null, 'p2', null, 'p1', null, 'p2', null, null] as const;

export function TicTacToeGlyph() {
  return (
    <div aria-hidden className="grid w-fit grid-cols-3 gap-[3px]">
      {TTT_CELLS.map((cell, i) => (
        <span
          key={i}
          className={cn(
            'size-[9px] border',
            cell === 'p1' && 'border-p1 bg-p1/70',
            cell === 'p2' && 'border-p2 bg-p2/70',
            cell === null && 'border-border-soft',
          )}
        />
      ))}
    </div>
  );
}

/** A fleet: bars of different lengths, hinting at the ship sizes. */
export function BattleshipGlyph() {
  return (
    <div aria-hidden className="flex w-fit items-center gap-[3px]">
      <span className="h-[9px] w-[9px] bg-p1" />
      <span className="h-[9px] w-[21px] bg-p2" />
      <span className="h-[9px] w-[15px] bg-chart-5" />
      <span className="h-[9px] w-[9px] bg-p1/50" />
    </div>
  );
}
