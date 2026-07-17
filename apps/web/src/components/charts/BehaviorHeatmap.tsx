import type { PsychologyPayload } from '@/api/client';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import type { Dict } from '@/i18n';
import { cn } from '@/lib/utils';

/** Fewer than this many matches → the pattern is noise, show the empty state (DoD). */
export const MIN_PSYCH_SAMPLE = 10;

type Accent = 'p1' | 'p2' | 'edu';

const accentBg: Record<Accent, string> = {
  p1: 'bg-p1',
  p2: 'bg-p2',
  edu: 'bg-edu',
};

/**
 * A behavioural heatmap (Module C, plan §5): an N-column grid where each cell's
 * fill intensity is its share of the busiest cell. Pure presentation — the caller
 * hands the raw counts and column count. `showValues` overlays the number (used
 * for the 3×3 tic-tac-toe grids; battleship boards are too dense for it).
 */
export function BehaviorHeatmap({
  values,
  cols,
  accent = 'edu',
  showValues = false,
  ariaLabel,
}: {
  values: number[];
  cols: number;
  accent?: Accent;
  showValues?: boolean;
  ariaLabel?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="grid gap-0.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {values.map((v, i) => {
        const intensity = v / max;
        const strong = intensity > 0.45;
        return (
          <div
            key={i}
            className="relative aspect-square rounded-[2px] border border-border/40 bg-card-inset"
          >
            <div
              className={cn('absolute inset-0 rounded-[2px]', accentBg[accent])}
              style={{ opacity: intensity * 0.85 }}
            />
            {showValues && v > 0 && (
              <span
                className={cn(
                  'absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold',
                  strong ? 'text-black' : 'text-foreground/80',
                )}
              >
                {v}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The full „Psychologia" section for a model card: a lead, the sample size, and
 * the game-appropriate grids — or an empty state below MIN_PSYCH_SAMPLE. `t` is
 * passed in so this stays a leaf component (no hook, easy to test/reuse).
 */
export function PsychologySection({
  t,
  payload,
  n,
}: {
  t: Dict;
  payload: PsychologyPayload | null;
  n: number;
}) {
  return (
    <HudPanel className="flex flex-col gap-3 p-5">
      <SectionLabel>{t.modelCard.psychology}</SectionLabel>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        {t.modelCard.psychologyLead}
      </p>
      {payload === null || n < MIN_PSYCH_SAMPLE ? (
        <p className="font-mono text-xs text-dim">{t.modelCard.psychologyEmpty}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-8">
            {payload.game === 'tictactoe' ? (
              <>
                <HeatmapCell label={t.modelCard.psychFirstMove}>
                  <BehaviorHeatmap
                    values={payload.firstMoveCounts}
                    cols={3}
                    showValues
                    ariaLabel={t.modelCard.psychFirstMove}
                  />
                </HeatmapCell>
                <HeatmapCell label={t.modelCard.psychAllMoves}>
                  <BehaviorHeatmap
                    values={payload.moveCounts}
                    cols={3}
                    showValues
                    accent="p1"
                    ariaLabel={t.modelCard.psychAllMoves}
                  />
                </HeatmapCell>
              </>
            ) : (
              <>
                <HeatmapCell label={t.modelCard.psychAllShots} wide>
                  <BehaviorHeatmap
                    values={payload.shotCounts}
                    cols={payload.size}
                    ariaLabel={t.modelCard.psychAllShots}
                  />
                </HeatmapCell>
                <HeatmapCell label={t.modelCard.psychFirstShot} wide>
                  <BehaviorHeatmap
                    values={payload.firstShotCounts}
                    cols={payload.size}
                    accent="p1"
                    ariaLabel={t.modelCard.psychFirstShot}
                  />
                </HeatmapCell>
              </>
            )}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {t.modelCard.psychologySample(n)}
          </p>
        </>
      )}
    </HudPanel>
  );
}

function HeatmapCell({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</span>
      <div style={{ width: wide ? 180 : 108 }}>{children}</div>
    </div>
  );
}
