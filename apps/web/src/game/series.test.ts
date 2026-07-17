import { TICTACTOE_VARIANTS } from '@arena/game-core';

import type { MatchOutcome, MoveLogEntry, RunMatchOptions } from './orchestrator';
import { type RunSeriesOptions, runSeries } from './series';

const variant = TICTACTOE_VARIANTS[0]!;

function move(player: 'p1' | 'p2', over: Partial<MoveLogEntry['telemetry']> = {}): MoveLogEntry {
  return {
    index: 0,
    player,
    move: 0,
    telemetry: { latencyMs: 100, retries: 0, forfeit: false, ...over },
  };
}

/** A fake orchestrator: records every call and returns a scripted outcome. */
function fakeRunner(outcomeFor: (opts: RunMatchOptions, call: number) => Partial<MatchOutcome>) {
  const calls: RunMatchOptions[] = [];
  let n = 0;
  const runner = async (opts: RunMatchOptions): Promise<MatchOutcome> => {
    calls.push(opts);
    const partial = outcomeFor(opts, n++);
    return {
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant: variant.id,
      p1Id: 'webllm:m',
      p2Id: 'webllm:m',
      winner: null,
      status: 'draw',
      moves: [],
      setup: { game: 'tictactoe', variant: variant.id },
      aborted: false,
      abortReason: null,
      ...partial,
    } as MatchOutcome;
  };
  return { runner: runner as unknown as typeof import('./orchestrator').runMatch, calls };
}

function baseOpts(over: Partial<RunSeriesOptions> = {}): RunSeriesOptions {
  return {
    game: 'tictactoe',
    variant,
    seriesLength: 4,
    seriesSeed: 1000,
    appendixA: 'PROMPT_A',
    appendixB: 'PROMPT_B',
    buildPlayer: (appendix) => ({
      id: `webllm:m#${appendix}`,
      displayName: appendix,
      kind: 'llm',
      getMove: async () => ({ move: 0, telemetry: { latencyMs: 1, retries: 0, forfeit: false } }),
    }),
    ...over,
  };
}

describe('runSeries — side swap (D10 fairness)', () => {
  it('gives prompt A p1 on even games and p2 on odd games, deterministic seeds', async () => {
    const { runner, calls } = fakeRunner(() => ({ winner: 'draw' }));
    await runSeries(baseOpts({ seriesLength: 4, seriesSeed: 1000, runner }));

    expect(calls).toHaveLength(4);
    // Seeds are seriesSeed + k.
    expect(calls.map((c) => c.config?.seed)).toEqual([1000, 1001, 1002, 1003]);
    // Even game: p1 carries appendix A; odd game: p1 carries appendix B.
    expect(calls[0]!.players.p1.displayName).toBe('PROMPT_A');
    expect(calls[0]!.players.p2.displayName).toBe('PROMPT_B');
    expect(calls[1]!.players.p1.displayName).toBe('PROMPT_B');
    expect(calls[1]!.players.p2.displayName).toBe('PROMPT_A');
  });
});

describe('runSeries — scoring in prompt terms', () => {
  it('credits the prompt that played the winning side, regardless of the swap', async () => {
    // Game 0: A=p1 wins (p1) → A. Game 1: A=p2, p1 wins → B. Game 2: A=p1, draw.
    const { runner } = fakeRunner((_opts, k) => ({
      winner: k === 0 ? 'p1' : k === 1 ? 'p1' : 'draw',
    }));
    const agg = await runSeries(baseOpts({ seriesLength: 3, runner }));
    expect(agg).toMatchObject({ games: 3, aWins: 1, bWins: 1, draws: 1 });
  });
});

describe('runSeries — telemetry aggregation per prompt', () => {
  it('sums tokens / cost / forfeits onto the prompt that owned each side', async () => {
    // One game, A = p1. p1 spends 30 tokens & forfeits once; p2 spends 10 tokens.
    const { runner } = fakeRunner(() => ({
      winner: 'p1',
      moves: [
        move('p1', { promptTokens: 20, completionTokens: 10, forfeit: true, costUsd: 0.02 }),
        move('p2', { promptTokens: 6, completionTokens: 4, costUsd: 0.01 }),
      ],
    }));
    const agg = await runSeries(baseOpts({ seriesLength: 1, runner }));
    expect(agg.tokensA).toBe(30);
    expect(agg.forfeitA).toBe(1);
    expect(agg.costA).toBeCloseTo(0.02);
    expect(agg.tokensB).toBe(10);
    expect(agg.forfeitB).toBe(0);
  });
});

describe('runSeries — abort mid-series', () => {
  it('stops before the next game when the signal is already aborted', async () => {
    const controller = new AbortController();
    const { runner, calls } = fakeRunner((_opts, k) => {
      if (k === 1) controller.abort(); // abort during the 2nd game
      return { winner: 'draw' };
    });
    const agg = await runSeries(
      baseOpts({ seriesLength: 5, signal: controller.signal, runner }),
    );
    // Games 0 and 1 ran; the abort is seen before game 2 → the loop stops there.
    expect(calls.length).toBe(2);
    expect(agg.games).toBe(2);
  });

  it('does not score a game the orchestrator reports as aborted', async () => {
    const { runner } = fakeRunner((_opts, k) => (k === 0 ? { winner: 'p1' } : { aborted: true, winner: null }));
    const agg = await runSeries(baseOpts({ seriesLength: 3, runner }));
    // The aborted game is not counted, and the series stops.
    expect(agg.games).toBe(1);
    expect(agg.aWins).toBe(1);
  });
});
