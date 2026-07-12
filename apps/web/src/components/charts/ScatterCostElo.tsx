import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { ChartFrame } from '@/components/charts/ChartFrame';
import { chartTheme, shortSubject, subjectColor } from '@/components/charts/theme';
import type { LeaderboardRow } from '@/api/client';
import { pl } from '@/i18n/pl';
import { formatCost } from '@/lib/format';
import { type ScatterPoint, buildScatter } from '@/lib/telemetry';

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="clip-cut border border-border bg-popover px-3 py-2 font-mono text-[11px]">
      <div className="text-foreground">{shortSubject(p.subjectId)}</div>
      <div className="text-dim">{pl.charts.tooltip.elo}: {Math.round(p.elo)}</div>
      <div className="text-dim">{pl.charts.tooltip.cost}: {formatCost(p.cost)}</div>
      <div className="text-dim">{pl.charts.tooltip.games}: {p.games}</div>
    </div>
  );
}

/** §9.3.3 — cost (log X) vs Elo (Y), bubble size = games played. */
export function ScatterCostElo({ rows }: { rows: LeaderboardRow[] }) {
  const data = buildScatter(rows);
  return (
    <ChartFrame
      title={pl.charts.scatter.title}
      takeaway={pl.charts.scatter.takeaway}
      empty={data.length === 0}
      exportName="koszt-vs-elo"
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 16, bottom: 20, left: -8 }}>
          <CartesianGrid stroke={chartTheme.grid} />
          <XAxis
            type="number"
            dataKey="cost"
            name={pl.charts.scatter.x}
            scale="log"
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => formatCost(v)}
            tick={{ fill: chartTheme.axis, fontSize: 9, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.grid }}
            label={{
              value: pl.charts.scatter.x,
              position: 'bottom',
              fill: chartTheme.axis,
              fontSize: 10,
            }}
          />
          <YAxis
            type="number"
            dataKey="elo"
            name={pl.charts.scatter.y}
            domain={['auto', 'auto']}
            tick={{ fill: chartTheme.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.grid }}
            width={44}
          />
          <ZAxis type="number" dataKey="games" range={[40, 360]} />
          <Tooltip cursor={{ stroke: chartTheme.grid }} content={<ScatterTooltip />} />
          <Scatter
            data={data}
            fill={chartTheme.p1}
            shape={(props: { cx?: number; cy?: number; payload?: ScatterPoint }) => {
              const { cx, cy, payload } = props;
              if (cx === undefined || cy === undefined || !payload) return <g />;
              const r = 4 + Math.min(12, Math.sqrt(payload.games) * 2);
              const color = subjectColor(payload.subjectId);
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={color}
                  strokeWidth={1.5}
                />
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
