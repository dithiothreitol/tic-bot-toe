import { Eraser, RotateCw, Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { canPlaceShip, generateFleet, shipCellsAt } from '@arena/game-core';

import { Button } from '@/components/ui/button';
import { pl } from '@/i18n/pl';
import { cn } from '@/lib/utils';

const COLS = 'ABCDEFGHIJ';

interface ShipPlacementProps {
  size: number;
  fleet: number[];
  accent: 'p1' | 'p2';
  onConfirm: (placement: number[][]) => void;
}

export function ShipPlacement({ size, fleet, accent, onConfirm }: ShipPlacementProps) {
  const [placed, setPlaced] = useState<number[][]>([]);
  const [horizontal, setHorizontal] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  const nextLen = placed.length < fleet.length ? fleet[placed.length] : null;
  const done = placed.length === fleet.length;

  const shipCellSet = useMemo(() => {
    const s = new Set<number>();
    for (const ship of placed) for (const c of ship) s.add(c);
    return s;
  }, [placed]);

  const preview = useMemo(() => {
    if (hover === null || nextLen === null) return null;
    const cells = shipCellsAt(hover, nextLen, horizontal, size);
    if (!cells) return null;
    return { cells: new Set(cells), ok: canPlaceShip(size, placed, cells) };
  }, [hover, nextLen, horizontal, size, placed]);

  const place = (start: number) => {
    if (nextLen === null) return;
    const cells = shipCellsAt(start, nextLen, horizontal, size);
    if (!cells || !canPlaceShip(size, placed, cells)) return;
    setPlaced((p) => [...p, cells]);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The screen had no heading at all — you landed on a grid with no title. */}
      <h2 className="font-sans text-2xl font-bold uppercase tracking-tight">
        {pl.placement.title}
      </h2>
      <p className="max-w-prose text-center text-sm text-muted-foreground">
        {pl.placement.instruction}
      </p>
      <p className="font-mono text-sm">
        {done ? pl.placement.allPlaced : pl.placement.nextShip(nextLen ?? 0)}
      </p>

      <div
        className="inline-grid gap-0.5"
        style={{
          gridTemplateColumns: `1rem repeat(${size}, minmax(1.5rem, 2rem))`,
        }}
        onMouseLeave={() => setHover(null)}
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
              const isShip = shipCellSet.has(idx);
              const inPreview = preview?.cells.has(idx) ?? false;
              return (
                <button
                  key={idx}
                  type="button"
                  aria-label={`${COLS[c]}${r + 1}`}
                  onMouseEnter={() => setHover(idx)}
                  onClick={() => place(idx)}
                  className={cn(
                    'aspect-square rounded-[3px] transition-colors',
                    isShip
                      ? accent === 'p1'
                        ? 'bg-p1/50'
                        : 'bg-p2/50'
                      : inPreview
                        ? preview?.ok
                          ? 'bg-emerald-500/50'
                          : 'bg-destructive/50'
                        : 'bg-card/40 hover:bg-muted',
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setHorizontal((h) => !h)}
          disabled={done}
        >
          <RotateCw className="size-4" /> {pl.placement.rotate}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPlaced(generateFleet(size, fleet, Math.random))}>
          <Shuffle className="size-4" /> {pl.placement.random}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPlaced([])}
          disabled={placed.length === 0}
        >
          <Eraser className="size-4" /> {pl.placement.clear}
        </Button>
      </div>

      <Button className="w-full max-w-xs" disabled={!done} onClick={() => onConfirm(placed)}>
        {pl.placement.ready}
      </Button>
    </div>
  );
}
