import { useMemo, useState } from 'react';

import {
  type AnalyzedMove,
  type MoveQuality,
  type PlayerSide,
  type SetupRecord,
  type TicTacToeState,
  analyzeMatch,
} from '@arena/game-core';

import { Board3x3 } from '@/components/Board3x3';
import { Button } from '@/components/ui/button';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import type { MatchConfig } from '@/components/GameRunner';
import type { MoveLogEntry } from '@/game/orchestrator';
import { useT } from '@/i18n';
import { formatMove } from '@/lib/format';
import { reconstructStates } from '@/lib/match-states';
import { cn } from '@/lib/utils';

/** SPEC §12.2 palette: optimal green, good cyan, weak yellow, blunder red. */
const QUALITY_TEXT: Record<MoveQuality, string> = {
  optimal: 'text-edu',
  good: 'text-p1',
  weak: 'text-warn',
  blunder: 'text-danger',
};
const QUALITY_RING: Record<MoveQuality, string> = {
  optimal: 'ring-2 ring-edu',
  good: 'ring-2 ring-p1',
  weak: 'ring-2 ring-warn',
  blunder: 'ring-2 ring-danger',
};

export function AnalysisView({
  config,
  log,
  setup,
}: {
  config: MatchConfig;
  log: MoveLogEntry[];
  /** Battleship needs the fleet layout to replay; tic-tac-toe passes null. */
  setup: SetupRecord | null;
}) {
  const t = useT();
  const moves: AnalyzedMove[] = useMemo(
    () => log.map((e) => ({ player: e.player, move: e.move })),
    [log],
  );

  const analysis = useMemo(
    () => analyzeMatch(config.game, config.variant.id, setup, moves),
    [config.game, config.variant.id, setup, moves],
  );

  // Reconstruct the position after each move (states[0] = initial).
  const states = useMemo(
    () => reconstructStates(config.game, config.variant.id, setup, moves),
    [config.game, config.variant.id, setup, moves],
  );

  const [step, setStep] = useState(moves.length); // start at the final position
  const clamp = (n: number) => Math.max(0, Math.min(moves.length, n));
  const currentMove = step > 0 ? analysis.moves[step - 1] : null;

  const nameOf = (side: PlayerSide) => (side === 'p1' ? config.names.p1 : config.names.p2);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <SectionLabel>{t.analysis.title}</SectionLabel>
        <p className="text-sm text-muted-foreground">{t.analysis.intro}</p>
      </header>

      {/* Per-player precision + turning point */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(['p1', 'p2'] as const).map((side) => {
          const acc = analysis.accuracy[side];
          return (
            <HudPanel key={side} cut accent={side} className="flex flex-col gap-1 px-4 py-3">
              <div
                className={cn('truncate font-sans font-bold', side === 'p1' ? 'text-p1' : 'text-p2')}
              >
                {nameOf(side)}
              </div>
              <div className="font-mono text-2xl font-bold">
                {Math.round(acc.rate * 100)}%
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-dim">
                {t.analysis.precision} · {acc.optimal}/{acc.moves}
              </div>
            </HudPanel>
          );
        })}
        <HudPanel accent="edu" className="flex flex-col justify-center gap-1 px-4 py-3">
          <div className="section-label">{t.analysis.turningPoint}</div>
          {analysis.turningPoint === null ? (
            <div className="font-mono text-xs text-edu">{t.analysis.noBlunder}</div>
          ) : (
            <button
              type="button"
              onClick={() => setStep(analysis.turningPoint! + 1)}
              className="text-left font-mono text-xs text-danger underline-offset-2 hover:underline"
            >
              #{analysis.turningPoint + 1} · {t.analysis.goToTurningPoint}
            </button>
          )}
        </HudPanel>
      </div>

      {/* Step-through: board (ttt) + caption */}
      <HudPanel brackets className="flex flex-col items-center gap-4 p-5">
        {config.game === 'tictactoe' ? (
          <Board3x3
            board={(states[step] as TicTacToeState).board}
            lastMove={step > 0 ? (moves[step - 1].move as number) : null}
            lastMoveClass={currentMove ? QUALITY_RING[currentMove.quality] : undefined}
          />
        ) : (
          <p className="max-w-prose text-center font-mono text-xs text-muted-foreground">
            {t.games.battleship} — {t.analysis.moveList} ↓
          </p>
        )}

        <div aria-live="polite" className="text-center font-mono text-sm">
          {currentMove ? (
            <span>
              #{step} {nameOf(currentMove.player)} → {formatMove(currentMove.move)} ·{' '}
              <span className={cn('font-bold uppercase', QUALITY_TEXT[currentMove.quality])}>
                {t.analysis.quality[currentMove.quality]}
              </span>
            </span>
          ) : (
            <span className="text-dim">{t.analysis.start}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep(0)} disabled={step === 0}>
            {t.analysis.first}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStep(clamp(step - 1))} disabled={step === 0}>
            {t.analysis.prev}
          </Button>
          <span className="min-w-20 text-center font-mono text-xs text-dim">
            {t.analysis.step} {step}/{moves.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(clamp(step + 1))}
            disabled={step === moves.length}
          >
            {t.analysis.next}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(moves.length)}
            disabled={step === moves.length}
          >
            {t.analysis.last}
          </Button>
        </div>
      </HudPanel>

      {/* Annotated move list (both games) */}
      <HudPanel className="p-4">
        <SectionLabel>{t.analysis.moveList}</SectionLabel>
        <ol className="mt-2 flex flex-wrap gap-1.5">
          {analysis.moves.map((m) => (
            <li key={m.index}>
              <button
                type="button"
                onClick={() => setStep(m.index + 1)}
                className={cn(
                  'clip-cut border bg-card-inset px-2 py-1 font-mono text-[11px] transition-colors',
                  step === m.index + 1 ? 'border-p1' : 'border-border',
                )}
                title={t.analysis.quality[m.quality]}
              >
                <span className={m.player === 'p1' ? 'text-p1' : 'text-p2'}>
                  #{m.index + 1}
                </span>{' '}
                <span className={cn('font-bold', QUALITY_TEXT[m.quality])}>
                  {formatMove(m.move)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </HudPanel>
    </div>
  );
}
