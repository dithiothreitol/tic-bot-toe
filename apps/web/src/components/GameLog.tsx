import { Badge } from '@/components/ui/badge';
import type { MoveLogEntry } from '@/game/orchestrator';
import { pl } from '@/i18n/pl';
import { formatCost, formatMove, formatMs, formatTokens } from '@/lib/format';
import { cn } from '@/lib/utils';

interface GameLogProps {
  moves: MoveLogEntry[];
  names: { p1: string; p2: string };
  className?: string;
}

export function GameLog({ moves, names, className }: GameLogProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {pl.log.title}
      </div>
      {moves.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">{pl.log.empty}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {moves.map((m) => (
            <li
              key={m.index}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded px-2 py-1 font-mono text-xs',
                m.player === 'p1' ? 'bg-p1/5' : 'bg-p2/5',
              )}
            >
              <span
                className={cn('font-semibold', m.player === 'p1' ? 'text-p1' : 'text-p2')}
              >
                #{m.index + 1} {(m.player === 'p1' ? names.p1 : names.p2).slice(0, 18)} →{' '}
                {formatMove(m.move)}
              </span>
              <span className="text-muted-foreground">{formatMs(m.telemetry.latencyMs)}</span>
              <span className="text-muted-foreground">
                {formatTokens(m.telemetry.promptTokens)}+
                {formatTokens(m.telemetry.completionTokens)} tok
              </span>
              <span className="text-muted-foreground">{formatCost(m.telemetry.costUsd)}</span>
              {m.telemetry.retries > 0 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">
                  {pl.log.retry} {m.telemetry.retries}
                </Badge>
              )}
              {m.telemetry.forfeit && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                  {pl.log.forfeit}
                </Badge>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
