import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { ChartFrame } from '@/components/charts/ChartFrame';
import { chartTheme, shortSubject } from '@/components/charts/theme';
import type { LeaderboardRow } from '@/api/client';
import { useT } from '@/i18n';
import { RADAR_AXES, type RadarAxisKey, radarForSubjects } from '@/lib/telemetry';

const SERIES_COLORS = [chartTheme.p1, chartTheme.p2] as const;

/**
 * §9.3.2 — 5-axis profile normalized vs the ranking population. Overlays up to
 * two subjects (used both standalone and inside CompareView). Empty state when
 * the population has < 2 subjects (§9.3.3).
 */
export function RadarCard({
  subjects,
  population,
  title,
}: {
  subjects: LeaderboardRow[];
  population: LeaderboardRow[];
  /** Defaults to the dictionary title — a param default cannot call a hook. */
  title?: string;
}) {
  const t = useT();
  const heading = title ?? t.charts.radar.title;
  const radar = radarForSubjects(subjects, population);
  const empty = radar.length === 0;

  const axisLabel: Record<RadarAxisKey, string> = t.charts.radar.axes;
  const data = RADAR_AXES.map((axis) => {
    const point: Record<string, string | number> = { axis: axisLabel[axis] };
    radar.forEach((d) => {
      point[d.subjectId] = d.values[axis];
    });
    return point;
  });

  return (
    <ChartFrame
      title={heading}
      takeaway={t.charts.radar.takeaway}
      empty={empty}
      exportName="radar-modelu"
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke={chartTheme.grid} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: chartTheme.text, fontSize: 11, fontFamily: 'Rajdhani' }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {radar.map((d, i) => (
            <Radar
              key={d.subjectId}
              name={shortSubject(d.subjectId)}
              dataKey={d.subjectId}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              fillOpacity={0.22}
              strokeWidth={2}
            />
          ))}
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
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
