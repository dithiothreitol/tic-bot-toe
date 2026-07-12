import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * HUD primitives — the signature of the Cyber-HUD direction (handoff/DESIGN.md §3).
 * Most panels are a <HudPanel>: angular surface + tech frame. Enhancements are
 * opt-in so they don't become noise:
 *  - `brackets` — 4 pulsing corner L-shapes. Reserve for "hero" panels
 *    (board, result card, daily challenge, edu callout).
 *  - `scanner`  — a cyan line sweeping vertically. Only "live"/active panels.
 *  - `cut`      — clipped top-left / bottom-right corner (buttons, slots, avatars).
 */
type HudAccent = 'p1' | 'p2' | 'edu';

const accentColor: Record<HudAccent, string> = {
  p1: 'text-p1',
  p2: 'text-p2',
  edu: 'text-edu',
};

const accentBorder: Record<HudAccent, string> = {
  p1: 'border-p1/40',
  p2: 'border-p2/40',
  edu: 'border-edu/40',
};

export interface HudPanelProps extends React.ComponentProps<'div'> {
  brackets?: boolean;
  scanner?: boolean;
  cut?: boolean;
  accent?: HudAccent;
}

export function HudPanel({
  className,
  brackets = false,
  scanner = false,
  cut = false,
  accent = 'p1',
  children,
  ...props
}: HudPanelProps) {
  return (
    <div
      data-slot="hud-panel"
      className={cn(
        'hud-panel',
        cut && 'clip-cut',
        scanner && 'overflow-hidden',
        accent !== 'p1' && accentBorder[accent],
        className,
      )}
      {...props}
    >
      {brackets && (
        <>
          <span className={cn('hud-corner hud-corner-tl', accentColor[accent])} />
          <span className={cn('hud-corner hud-corner-tr', accentColor[accent])} />
          <span className={cn('hud-corner hud-corner-bl', accentColor[accent])} />
          <span className={cn('hud-corner hud-corner-br', accentColor[accent])} />
        </>
      )}
      {scanner && <span aria-hidden className="hud-scanner" />}
      {children}
    </div>
  );
}

/**
 * `// SECTION` header: mono, uppercase, wide-tracked, dim, prefixed with `//`
 * and a small L-bracket (DESIGN §3). Optional numeric tag ("01").
 */
export function SectionLabel({
  children,
  tag,
  className,
  ...props
}: React.ComponentProps<'div'> & { tag?: string }) {
  return (
    <div className={cn('section-label flex items-center gap-2', className)} {...props}>
      <span aria-hidden className="text-p1/70">
        {'//'}
      </span>
      {tag && <span className="text-p1">{tag}</span>}
      <span>{children}</span>
    </div>
  );
}
