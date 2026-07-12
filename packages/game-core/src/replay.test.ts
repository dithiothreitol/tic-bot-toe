import { describe, expect, it } from 'vitest';

import { getGame } from './index';
import { type ReplayMove, movesHash, replayMatch } from './replay';
import type { GameDefinition, GameId, Move, SetupRecord } from './types';

/** Play a full game (each side takes the first legal move); return moves + setup. */
function playOut(game: GameId, variantId: string, seed: number) {
  const def = getGame(game) as unknown as GameDefinition<unknown, Move>;
  const variant = def.variants.find((v) => v.id === variantId)!;
  let state = def.createInitialState(variant, { seed });
  const moves: ReplayMove[] = [];
  let guard = 0;
  while (def.status(state) === 'playing' && guard++ < 1000) {
    const side = def.currentPlayer(state);
    const move = def.legalMoves(state, side)[0]!;
    moves.push({ player: side, move });
    state = def.applyMove(state, side, move);
  }
  return { moves, setup: def.serializeSetup(state) as SetupRecord, status: def.status(state) };
}

describe('replayMatch — tic-tac-toe', () => {
  it('accepts a legitimate game and reports the winner', () => {
    const { moves, status } = playOut('tictactoe', 'standard', 0);
    const result = replayMatch('tictactoe', 'standard', null, moves);
    expect(result.valid).toBe(true);
    expect(result.status).toBe(status);
    expect(result.winner).not.toBeNull();
    expect(result.moveCount).toBe(moves.length);
  });

  it('rejects an illegal move (occupied cell)', () => {
    const { moves } = playOut('tictactoe', 'standard', 0);
    const tampered = moves.map((m, i) => (i === 2 ? { ...m, move: moves[0]!.move } : m));
    const result = replayMatch('tictactoe', 'standard', null, tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/illegal/);
  });

  it('rejects a wrong player order', () => {
    const { moves } = playOut('tictactoe', 'standard', 0);
    const tampered = moves.map((m, i) => (i === 1 ? { ...m, player: 'p1' as const } : m));
    const result = replayMatch('tictactoe', 'standard', null, tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/expected/);
  });

  it('rejects a move after the game is over', () => {
    const { moves } = playOut('tictactoe', 'standard', 0);
    const extra: ReplayMove[] = [...moves, { player: 'p1', move: 0 }];
    const result = replayMatch('tictactoe', 'standard', null, extra);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/already over/);
  });
});

describe('replayMatch — battleship', () => {
  it('accepts a legitimate game using the recorded setup (placements + seed)', () => {
    const { moves, setup, status } = playOut('battleship', 'small', 5);
    const result = replayMatch('battleship', 'small', setup, moves);
    expect(result.valid).toBe(true);
    expect(result.status).toBe(status);
    expect(['p1', 'p2']).toContain(result.winner);
  });

  it('rejects tampered setup that makes a shot illegal', () => {
    const { moves, setup } = playOut('battleship', 'small', 5);
    // Fire the same first coordinate twice → second is illegal on replay.
    const tampered: ReplayMove[] = [moves[0]!, { ...moves[0]! }, ...moves.slice(1)];
    const result = replayMatch('battleship', 'small', setup, tampered);
    expect(result.valid).toBe(false);
  });
});

describe('movesHash', () => {
  it('is stable, 64 hex chars, and sensitive to the moves', async () => {
    const { moves, setup } = playOut('tictactoe', 'standard', 1);
    const h1 = await movesHash('tictactoe', 'standard', setup, moves);
    const h2 = await movesHash('tictactoe', 'standard', setup, moves);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    const tampered = moves.map((m, i) => (i === 0 ? { ...m, move: 8 } : m));
    expect(await movesHash('tictactoe', 'standard', setup, tampered)).not.toBe(h1);
  });
});
