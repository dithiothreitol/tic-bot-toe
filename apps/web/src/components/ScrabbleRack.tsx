import { type ScrabbleVariant, letterValues } from '@arena/game-core';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

interface ScrabbleRackProps {
  rack: string[];
  variant: ScrabbleVariant;
  accent?: 'p1' | 'p2';
  /** Highlighted tiles (e.g. selected for exchange). */
  selected?: Set<number>;
  onTileClick?: (index: number) => void;
  title?: string;
}

/** A player's rack of 7 tiles (plan §7.3). Blank shows '?'. */
export function ScrabbleRack({
  rack,
  variant,
  accent = 'p1',
  selected,
  onTileClick,
  title,
}: ScrabbleRackProps) {
  const t = useT();
  const values = letterValues(variant);
  return (
    <div className="flex flex-col items-center gap-1">
      {title && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{title}</span>
      )}
      <div className="flex flex-wrap justify-center gap-1" aria-label={t.scrabble.rackLabel}>
        {rack.map((tile, i) => {
          const canClick = onTileClick !== undefined;
          const value = tile === '?' ? 0 : values.get(tile) ?? 0;
          return (
            <button
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              type="button"
              disabled={!canClick}
              aria-label={tile === '?' ? t.scrabble.blankTile : tile}
              onClick={canClick ? () => onTileClick?.(i) : undefined}
              className={cn(
                'clip-cut relative flex size-9 items-center justify-center border font-mono text-base font-bold sm:size-10',
                accent === 'p1' ? 'border-p1/50 bg-p1/10 text-p1' : 'border-p2/50 bg-p2/10 text-p2',
                canClick && 'cursor-pointer hover:brightness-125',
                selected?.has(i) && 'ring-2 ring-edu brightness-125',
              )}
            >
              {tile}
              {tile !== '?' && (
                <span className="absolute bottom-0 right-0.5 text-[8px] font-normal opacity-70">
                  {value}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
