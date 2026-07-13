import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartTheme } from '@/components/charts/theme';
import { ChartFrame } from '@/components/charts/ChartFrame';
import type { MoveLogEntry } from '@/game/orchestrator';
import { useT } from '@/i18n';
import { type TimelinePoint, buildTimeline } from '@/lib/telemetry';

/** Bar color: player accent, or warn/danger when the move needed retries / was forfeited. */
function barColor(p: TimelinePoint): string {
  if (p.forfeit) return chartTheme.danger;
  if (p.retries > 0) return chartTheme.warn;
  return p.player === 'p1' ? chartTheme.p1 : chartTheme.p2;
}

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: { payload: TimelinePoint }[] }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="clip-cut border border-border bg-popover px-3 py-2 font-mono text-[11px]">
      <div className={p.player === 'p1' ? 'text-p1' : 'text-p2'}>
        {t.charts.timeline.move} {p.index} · {p.player === 'p1' ? 'P1' : 'P2'}
      </div>
      <div className="text-foreground">
        {p.seconds}
        {t.charts.timeline.seconds}
      </div>
      {p.retries > 0 && (
        <div className="text-warn">⟲ {p.retries} {t.charts.timeline.retries}</div>
      )}
      {p.forfeit && <div className="text-danger">⚑ {t.charts.timeline.forfeit}</div>}
    </div>
  );
}

/** §9.3.1 — per-move thinking time, live during the game. */
export function TimelineChart({ log, live = false }: { log: MoveLogEntry[]; live?: boolean }) {
  const t = useT();
  const data = buildTimeline(log);
  return (
    <ChartFrame
      title={t.charts.timeline.title}
      takeaway={t.charts.timeline.takeaway}
      empty={data.length === 0}
      exportName="os-czasu"
      height={200}
      scanner={live}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: chartTheme.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.grid }}
          />
          <YAxis
            tick={{ fill: chartTheme.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.grid }}
            width={36}
            unit={t.charts.timeline.seconds}
          />
          <Tooltip
            cursor={{ fill: 'rgba(53,231,255,0.06)' }}
            content={<TimelineTooltip />}
          />
          <Bar dataKey="seconds" radius={0} isAnimationActive={!live}>
            {data.map((p) => (
              <Cell key={p.index} fill={barColor(p)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
