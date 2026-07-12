import { TICTACTOE_VARIANTS } from '@arena/game-core';
import type { Move, Player, PlayerView } from '@arena/game-core';

import { runMatch } from './orchestrator';

const variant = TICTACTOE_VARIANTS[0];

/** Deterministic bot: always takes the lowest legal cell. */
function firstLegalPlayer(id: string): Player {
  return {
    id,
    displayName: id,
    kind: 'llm',
    getMove(_view: PlayerView, legal: Move[]) {
      return Promise.resolve({
        move: legal[0],
        telemetry: { latencyMs: 1, retries: 0, forfeit: false },
      });
    },
  };
}

describe('runMatch', () => {
  it('plays a full game to a winner and logs every move with telemetry', async () => {
    const onMove = vi.fn();
    const outcome = await runMatch({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant,
      players: { p1: firstLegalPlayer('A'), p2: firstLegalPlayer('B') },
      onMove,
    });

    // A: 0,2,4,6 → line [2,4,6]; B: 1,3,5
    expect(outcome.status).toBe('p1_won');
    expect(outcome.winner).toBe('p1');
    expect(outcome.moves).toHaveLength(7);
    expect(outcome.moves.every((m) => m.telemetry.forfeit === false)).toBe(true);
    expect(outcome.moves[0]).toMatchObject({ index: 0, player: 'p1', move: 0 });
    expect(outcome.moves[1]).toMatchObject({ index: 1, player: 'p2', move: 1 });
    expect(onMove).toHaveBeenCalledTimes(7);
    expect(outcome.aborted).toBe(false);
    expect(outcome.p1Id).toBe('A');
    expect(outcome.p2Id).toBe('B');
    expect(outcome.setup).toEqual({ game: 'tictactoe', variant: 'standard' });
  });

  it('fires onStart before any move and onEnd once with the outcome', async () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    await runMatch({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant,
      players: { p1: firstLegalPlayer('A'), p2: firstLegalPlayer('B') },
      onStart,
      onEnd,
    });
    expect(onStart).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('aborts cleanly via the signal (winner null, aborted true) even mid-think', async () => {
    const ctrl = new AbortController();
    const hanging: Player = {
      id: 'H',
      displayName: 'H',
      kind: 'llm',
      getMove: () => new Promise<never>(() => {}),
    };
    const promise = runMatch({
      mode: 'human_vs_model',
      game: 'tictactoe',
      variant,
      players: { p1: hanging, p2: hanging },
      signal: ctrl.signal,
    });
    ctrl.abort();
    const outcome = await promise;
    expect(outcome.aborted).toBe(true);
    expect(outcome.winner).toBeNull();
    expect(outcome.moves).toHaveLength(0);
  });
});
