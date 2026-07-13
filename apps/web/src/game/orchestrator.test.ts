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

/** Bot that always forfeits (a random legal move), like a model that can't comply. */
function forfeitingPlayer(id: string, tokensPerMove = 0): Player {
  return {
    id,
    displayName: id,
    kind: 'llm',
    getMove(_view: PlayerView, legal: Move[]) {
      return Promise.resolve({
        move: legal[0],
        telemetry: {
          latencyMs: 1,
          retries: 3,
          forfeit: true,
          promptTokens: tokensPerMove,
          completionTokens: 0,
        },
      });
    },
  };
}

/** Forfeits every other own turn, so its personal forfeit streak never exceeds 1. */
function flakyPlayer(id: string): Player {
  let n = 0;
  return {
    id,
    displayName: id,
    kind: 'llm',
    getMove(_view: PlayerView, legal: Move[]) {
      const forfeit = n % 2 === 0;
      n += 1;
      return Promise.resolve({
        move: legal[0],
        telemetry: { latencyMs: 1, retries: forfeit ? 3 : 0, forfeit },
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
    expect(outcome.abortReason).toBe('user');
    expect(outcome.moves).toHaveLength(0);
  });

  it('records abortReason null on a match that finishes on its own', async () => {
    const outcome = await runMatch({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant,
      players: { p1: firstLegalPlayer('A'), p2: firstLegalPlayer('B') },
    });
    expect(outcome.aborted).toBe(false);
    expect(outcome.abortReason).toBeNull();
  });

  it('auto-stops (stalled) after N forfeits in a row by one player', async () => {
    const outcome = await runMatch({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant,
      players: { p1: forfeitingPlayer('A'), p2: forfeitingPlayer('B') },
      maxConsecutiveForfeits: 3,
    });
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe('stalled');
    expect(outcome.winner).toBeNull();
    // Counted per player: p1 forfeits on moves 0,2,4 → its 3rd forfeit (move 4)
    // trips the fuse. p2's interleaved forfeits sit on their own counter.
    expect(outcome.moves).toHaveLength(5);
  });

  it('auto-stops (stalled) when ONE model forfeits every turn, even if the opponent plays clean', async () => {
    // The reported failure: a model that forfeits 100% of its moves burns tokens
    // forever while a clean opponent keeps resetting a pooled counter. Per-player
    // counting catches it — p2 forfeits on moves 1 and 3 → trips on the 2nd.
    const outcome = await runMatch({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant,
      players: { p1: firstLegalPlayer('A'), p2: forfeitingPlayer('B') },
      maxConsecutiveForfeits: 2,
    });
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe('stalled');
    expect(outcome.moves).toHaveLength(4);
  });

  it('does NOT trip on scattered forfeits — a clean move resets that player streak', async () => {
    const outcome = await runMatch({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant,
      // p2 forfeits every OTHER own turn, so its personal streak never reaches 2.
      players: { p1: firstLegalPlayer('A'), p2: flakyPlayer('B') },
      maxConsecutiveForfeits: 2,
    });
    expect(outcome.aborted).toBe(false);
    expect(outcome.abortReason).not.toBe('stalled');
  });

  it('auto-stops (budget) once the token budget is spent', async () => {
    const outcome = await runMatch({
      mode: 'model_vs_model',
      game: 'tictactoe',
      variant,
      players: { p1: forfeitingPlayer('A', 100), p2: forfeitingPlayer('B', 100) },
      maxTokens: 250,
    });
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe('budget');
    expect(outcome.moves).toHaveLength(3); // 100+100+100 ≥ 250
  });
});
