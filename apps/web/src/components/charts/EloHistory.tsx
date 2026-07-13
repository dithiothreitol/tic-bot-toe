import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartFrame } from '@/components/charts/ChartFrame';
import { chartTheme } from '@/components/charts/theme';
import type { EloHistoryPoint } from '@/api/client';
import { useT } from '@/i18n';

const ELO_START = 1000;

/** §9.3.4 — Elo after each saved match; prepends the 1000 start point. */
export function EloHistory({ points }: { points: EloHistoryPoint[] }) {
  const t = useT();
  const data = [
    { i: 0, elo: ELO_START, label: t.charts.elo.start },
    ...points.map((p, idx) => ({ i: idx + 1, elo: Math.round(p.eloAfter), label: `#${idx + 1}` })),
  ];

  return (
    <ChartFrame
      title={t.charts.elo.title}
      takeaway={t.charts.elo.takeaway}
      empty={points.length === 0}
      exportName="przebieg-elo"
      height={220}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: chartTheme.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.grid }}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: chartTheme.axis, fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: chartTheme.grid }}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: chartTheme.surface,
              border: `1px solid ${chartTheme.grid}`,
              borderRadius: 0,
              fontFamily: 'JetBrains Mono',
              fontSize: 11,
            }}
            labelStyle={{ color: chartTheme.text }}
          />
          <Line
            type="monotone"
            dataKey="elo"
            stroke={chartTheme.p1}
            strokeWidth={2}
            dot={{ r: 2, fill: chartTheme.p1 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
