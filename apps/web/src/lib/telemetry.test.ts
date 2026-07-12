import { describe, expect, it } from 'vitest';

import type { LeaderboardRow } from '@/api/client';
import type { MoveLogEntry } from '@/game/orchestrator';

import { buildScatter, buildTimeline, radarForSubjects, sideTotals } from './telemetry';

function row(over: Partial<LeaderboardRow>): LeaderboardRow {
  return {
    subjectId: 'x',
    elo: 1000,
    wins: 0,
    losses: 0,
    draws: 0,
    games: 0,
    forfeitRate: 0,
    avgLatencyMs: 1000,
    avgTokensPerMove: 50,
    avgCostPerGame: 0.001,
    optimalRate: null,
    ...over,
  };
}

describe('buildTimeline', () => {
  it('maps moves to 1-based labelled bars with seconds and markers', () => {
    const log: MoveLogEntry[] = [
      { index: 0, player: 'p1', move: 4, telemetry: { latencyMs: 2100, retries: 0, forfeit: false } },
      { index: 1, player: 'p2', move: 0, telemetry: { latencyMs: 1300, retries: 2, forfeit: true } },
    ];
    const pts = buildTimeline(log);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ index: 1, label: '#1', player: 'p1', seconds: 2.1 });
    expect(pts[1]).toMatchObject({ label: '#2', player: 'p2', retries: 2, forfeit: true });
  });
});

describe('radarForSubjects', () => {
  it('returns empty (empty-state) when population < 2 subjects', () => {
    expect(radarForSubjects([row({ subjectId: 'a' })], [row({ subjectId: 'a' })])).toEqual([]);
  });

  it('normalizes each axis 0..100 vs population (best=100, worst=0)', () => {
    const pop = [
      row({ subjectId: 'best', elo: 1200, avgLatencyMs: 500, forfeitRate: 0, avgTokensPerMove: 20, avgCostPerGame: 0.001 }),
      row({ subjectId: 'worst', elo: 1000, avgLatencyMs: 3000, forfeitRate: 0.3, avgTokensPerMove: 200, avgCostPerGame: 0.02 }),
    ];
    const [best, worst] = radarForSubjects(pop, pop);
    // Higher Elo, lower latency/tokens/cost, fewer forfeits ⇒ 100 across the board.
    expect(best.values).toEqual({ strength: 100, speed: 100, discipline: 100, economy: 100, cheapness: 100 });
    expect(worst.values).toEqual({ strength: 0, speed: 0, discipline: 0, economy: 0, cheapness: 0 });
  });

  it('does not explode on equal values (neutral 50)', () => {
    const pop = [row({ subjectId: 'a', elo: 1000 }), row({ subjectId: 'b', elo: 1000 })];
    const [a] = radarForSubjects(pop, pop);
    expect(a.values.strength).toBe(50);
  });

  it('treats null telemetry (WebLLM) as the low end without breaking the axis', () => {
    const pop = [
      row({ subjectId: 'paid', avgCostPerGame: 0.01, avgTokensPerMove: 100 }),
      row({ subjectId: 'webllm', avgCostPerGame: null, avgTokensPerMove: null }),
    ];
    const res = radarForSubjects(pop, pop);
    const webllm = res.find((r) => r.subjectId === 'webllm')!;
    expect(webllm.values.cheapness).toBe(0);
    expect(webllm.values.economy).toBe(0);
    // The subject with real telemetry is the sole range member → neutral 50.
    const paid = res.find((r) => r.subjectId === 'paid')!;
    expect(paid.values.cheapness).toBe(50);
  });
});

describe('buildScatter', () => {
  it('keeps only rows with a positive cost (log axis)', () => {
    const pts = buildScatter([
      row({ subjectId: 'a', avgCostPerGame: 0.002, elo: 1100, games: 5 }),
      row({ subjectId: 'free', avgCostPerGame: null }),
      row({ subjectId: 'zero', avgCostPerGame: 0 }),
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ subjectId: 'a', cost: 0.002, elo: 1100, games: 5 });
  });
});

describe('sideTotals (per-player running telemetry)', () => {
  const mv = (
    player: 'p1' | 'p2',
    latencyMs: number,
    promptTokens?: number,
    completionTokens?: number,
  ) =>
    ({
      index: 0,
      player,
      move: 0,
      telemetry: { latencyMs, retries: 0, forfeit: false, promptTokens, completionTokens },
    }) as unknown as MoveLogEntry;

  it('sums only that side’s thinking time and tokens', () => {
    const log = [mv('p1', 1000, 10, 2), mv('p2', 5000, 100, 20), mv('p1', 2000, 30, 8)];
    expect(sideTotals(log, 'p1')).toEqual({ moves: 2, latencyMs: 3000, tokens: 50 });
    expect(sideTotals(log, 'p2')).toEqual({ moves: 1, latencyMs: 5000, tokens: 120 });
  });

  // §20: a missing token count is "—", never 0 — the human player reports none.
  it('reports null tokens when no move reported usage', () => {
    const log = [mv('p1', 1200), mv('p1', 900)];
    expect(sideTotals(log, 'p1')).toEqual({ moves: 2, latencyMs: 2100, tokens: null });
  });

  it('is empty for a side that has not moved', () => {
    expect(sideTotals([], 'p1')).toEqual({ moves: 0, latencyMs: 0, tokens: null });
  });
});
