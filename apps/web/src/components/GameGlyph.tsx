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

/** A tiny 4×4 sudoku with a 2×2 box split and a couple of scored cells. */
const SUDOKU_CELLS = ['p1', null, null, 'p2', null, null, 'p1', null, null, 'p2', null, null, 'p1', null, null, 'p2'] as const;

export function SudokuGlyph() {
  return (
    <div aria-hidden className="grid w-fit grid-cols-4 gap-[2px]">
      {SUDOKU_CELLS.map((cell, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <span
            key={i}
            className={cn(
              'size-[7px] border border-border-soft',
              // 2×2 box seams.
              col === 2 && 'border-l-border',
              row === 2 && 'border-t-border',
              cell === 'p1' && 'border-p1 bg-p1/70',
              cell === 'p2' && 'border-p2 bg-p2/70',
            )}
          />
        );
      })}
    </div>
  );
}

/** Three lettered tiles, hinting at a word game. */
export function ScrabbleGlyph() {
  return (
    <div aria-hidden className="flex w-fit items-center gap-[2px]">
      {['W', 'O', 'R'].map((ch, i) => (
        <span
          key={ch}
          className={cn(
            'flex size-[11px] items-center justify-center border font-mono text-[7px] font-bold leading-none',
            i === 1 ? 'border-p2/60 bg-p2/20 text-p2' : 'border-p1/60 bg-p1/20 text-p1',
          )}
        >
          {ch}
        </span>
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
