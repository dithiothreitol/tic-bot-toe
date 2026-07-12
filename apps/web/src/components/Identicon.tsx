import { useMemo } from 'react';

import { IDENTICON_SIZE, identiconCells } from '@/lib/identicon';
import { cn } from '@/lib/utils';

type Accent = 'p1' | 'p2' | 'edu';

const FILL: Record<Accent, string> = {
  p1: 'bg-p1',
  p2: 'bg-p2',
  edu: 'bg-edu',
};

const PLATE: Record<Accent, string> = {
  p1: 'bg-p1/10',
  p2: 'bg-p2/10',
  edu: 'bg-edu/10',
};

/**
 * Deterministic model avatar (SPEC §4). Purely decorative — the model's name is
 * always spelled out next to it, so this is aria-hidden.
 */
export function Identicon({
  seed,
  accent = 'p1',
  className,
}: {
  seed: string;
  accent?: Accent;
  className?: string;
}) {
  const cells = useMemo(() => identiconCells(seed), [seed]);

  return (
    <span
      aria-hidden
      className={cn('clip-cut grid size-9 shrink-0 gap-px p-1', PLATE[accent], className)}
      style={{ gridTemplateColumns: `repeat(${IDENTICON_SIZE}, minmax(0, 1fr))` }}
    >
      {cells.map((on, i) => (
        <span key={i} className={cn('block', on && FILL[accent])} />
      ))}
    </span>
  );
}
