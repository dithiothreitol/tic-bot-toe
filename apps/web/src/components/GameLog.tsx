import { Fragment } from 'react';

import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/ui/hud';
import type { MoveLogEntry } from '@/game/orchestrator';
import { useT } from '@/i18n';
import { formatCost, formatMove, formatMs, formatTokens } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Commentary } from '@/providers/commentator';

interface GameLogProps {
  moves: MoveLogEntry[];
  names: { p1: string; p2: string };
  /** Commentator bubbles (§12.1) — may arrive after their move, hence the lookup. */
  commentary?: Commentary[];
  /**
   * Per-move outcome flag (sudoku): true = correct placement (✓ +1), false =
   * consistent but wrong (✗ −1). Indexed by move index; undefined for games
   * without a per-move ✓/✗ notion.
   */
  correctness?: (boolean | undefined)[];
  className?: string;
}

/** A commentator bubble, rendered under the move it is about (§12.1). */
export function CommentBubble({ text }: { text: string }) {
  return (
    <li className="ml-4 flex items-start gap-2 border-l-2 border-edu/50 bg-edu/5 px-2 py-1.5">
      <span aria-hidden className="font-mono text-xs text-edu">
        ▸
      </span>
      <p className="font-sans text-xs leading-snug text-edu/90">{text}</p>
    </li>
  );
}

export function GameLog({ moves, names, commentary = [], correctness, className }: GameLogProps) {
  const t = useT();
  const byMove = new Map(commentary.map((c) => [c.moveIndex, c]));
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between">
        <SectionLabel>{t.log.title}</SectionLabel>
        <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
          {t.log.telemetry}
        </span>
      </div>
      {moves.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">{t.log.empty}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {moves.map((m) => (
            <Fragment key={m.index}>
            <li
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-0.5 border-l-2 px-2 py-1 font-mono text-xs',
                m.player === 'p1' ? 'border-p1/60 bg-p1/5' : 'border-p2/60 bg-p2/5',
              )}
            >
              <span
                className={cn('font-semibold', m.player === 'p1' ? 'text-p1' : 'text-p2')}
              >
                #{m.index + 1} {(m.player === 'p1' ? names.p1 : names.p2).slice(0, 18)} →{' '}
                {formatMove(m.move)}
                {correctness?.[m.index] !== undefined && (
                  <span className={cn('ml-1', correctness[m.index] ? 'text-edu' : 'text-danger')}>
                    {correctness[m.index] ? '✓ +1' : '✗ −1'}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">{formatMs(m.telemetry.latencyMs)}</span>
              <span className="text-muted-foreground">
                {formatTokens(m.telemetry.promptTokens)}+
                {formatTokens(m.telemetry.completionTokens)} tok
              </span>
              <span className="text-muted-foreground">{formatCost(m.telemetry.costUsd)}</span>
              {m.telemetry.retries > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {t.log.retry} {m.telemetry.retries}
                </Badge>
              )}
              {m.telemetry.forfeit && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                  {t.log.forfeit}
                  {m.telemetry.error && ` · ${t.log.reason[m.telemetry.error]}`}
                </Badge>
              )}
            </li>
            {byMove.has(m.index) && <CommentBubble text={byMove.get(m.index)!.text} />}
            </Fragment>
          ))}
        </ol>
      )}
    </div>
  );
}
