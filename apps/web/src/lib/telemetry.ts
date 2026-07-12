/**
 * Pure telemetry → chart-data transforms (SPEC §9.3). No React, no Recharts —
 * kept here so the normalization rules are unit-testable in isolation
 * (acceptance §9.3.3: radar normalizes vs population and never explodes at
 * < 2 subjects).
 */
import type { LeaderboardRow } from '@/api/client';
import type { MoveLogEntry } from '@/game/orchestrator';

// ---------------------------------------------------------------- 1. Timeline
export interface TimelinePoint {
  index: number; // 1-based move number
  label: string; // "#1"
  player: 'p1' | 'p2';
  latencyMs: number;
  seconds: number;
  retries: number;
  forfeit: boolean;
}

/** Per-move thinking time for the live bar chart (§9.3.1). */
export function buildTimeline(log: MoveLogEntry[]): TimelinePoint[] {
  return log.map((m) => ({
    index: m.index + 1,
    label: `#${m.index + 1}`,
    player: m.player,
    latencyMs: m.telemetry.latencyMs,
    seconds: Math.round((m.telemetry.latencyMs / 1000) * 100) / 100,
    retries: m.telemetry.retries,
    forfeit: m.telemetry.forfeit,
  }));
}

// ------------------------------------------------------------------- 2. Radar
export const RADAR_AXES = [
  'strength',
  'speed',
  'discipline',
  'economy',
  'cheapness',
] as const;
export type RadarAxisKey = (typeof RADAR_AXES)[number];

export interface RadarDatum {
  subjectId: string;
  /** 0..100 per axis, normalized vs the population. */
  values: Record<RadarAxisKey, number>;
}

/**
 * "Goodness" raw metric per axis (higher = better), or null when unknown.
 * Speed/economy/cheapness are negated so lower latency/tokens/cost ranks higher.
 */
function rawGoodness(row: LeaderboardRow): Record<RadarAxisKey, number | null> {
  return {
    strength: row.elo,
    speed: row.avgLatencyMs === null ? null : -row.avgLatencyMs,
    discipline: 1 - row.forfeitRate,
    economy: row.avgTokensPerMove === null ? null : -row.avgTokensPerMove,
    cheapness: row.avgCostPerGame === null ? null : -row.avgCostPerGame,
  };
}

/**
 * Min-max normalize one axis across the population to 0..100.
 * - equal min/max (or a single value) → 50 (neutral; never divides by zero)
 * - null raw → 0 (unknown telemetry shown as the low end; excluded from range)
 */
function normalizeAxis(raws: (number | null)[]): number[] {
  const present = raws.filter((v): v is number => v !== null);
  if (present.length === 0) return raws.map(() => 0);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min;
  return raws.map((v) => {
    if (v === null) return 0;
    if (span === 0) return 50;
    return Math.round(((v - min) / span) * 100);
  });
}

/**
 * Radar values for `subjects`, each axis normalized vs `population` (§9.3.2).
 * Returns [] when the population has < 2 subjects — the caller shows the empty
 * state (§9.3.3: "za mało danych — rozegraj partie").
 */
export function radarForSubjects(
  subjects: LeaderboardRow[],
  population: LeaderboardRow[],
): RadarDatum[] {
  if (population.length < 2) return [];

  const popRaw = population.map(rawGoodness);
  const normPerAxis = {} as Record<RadarAxisKey, Map<string, number>>;
  for (const axis of RADAR_AXES) {
    const normalized = normalizeAxis(popRaw.map((r) => r[axis]));
    const byId = new Map<string, number>();
    population.forEach((row, i) => byId.set(row.subjectId, normalized[i]!));
    normPerAxis[axis] = byId;
  }

  return subjects.map((s) => {
    const values = {} as Record<RadarAxisKey, number>;
    for (const axis of RADAR_AXES) values[axis] = normPerAxis[axis].get(s.subjectId) ?? 0;
    return { subjectId: s.subjectId, values };
  });
}

// ----------------------------------------------------------------- 3. Scatter
export interface ScatterPoint {
  subjectId: string;
  cost: number; // avg USD / game (X, log scale)
  elo: number; // Y
  games: number; // bubble radius
}

/** Cost-vs-Elo bubbles (§9.3.3). Rows without a cost can't sit on a log axis. */
export function buildScatter(rows: LeaderboardRow[]): ScatterPoint[] {
  return rows
    .filter((r) => r.avgCostPerGame !== null && r.avgCostPerGame > 0)
    .map((r) => ({
      subjectId: r.subjectId,
      cost: r.avgCostPerGame as number,
      elo: r.elo,
      games: r.games,
    }));
}
