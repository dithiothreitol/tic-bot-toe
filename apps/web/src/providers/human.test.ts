import { TICTACTOE_VARIANTS, ticTacToe } from '@arena/game-core';

import { createHumanPlayer } from './human';

const variant = TICTACTOE_VARIANTS[0];

describe('createHumanPlayer', () => {
  it('resolves getMove when submit is called with a legal move (records think time)', async () => {
    let clock = 100;
    const handle = createHumanPlayer('human', 'Człowiek', () => clock);
    const s = ticTacToe.createInitialState(variant, {});
    const legal = ticTacToe.legalMoves(s, 'p1');

    const pending = handle.player.getMove(ticTacToe.viewFor(s, 'p1'), legal);
    expect(handle.isWaiting()).toBe(true);
    expect(handle.pendingLegal()).toEqual(legal);

    clock = 250;
    expect(handle.submit(4)).toBe(true);

    const result = await pending;
    expect(result.move).toBe(4);
    expect(result.telemetry.latencyMs).toBe(150);
    expect(result.telemetry.forfeit).toBe(false);
    expect(handle.isWaiting()).toBe(false);
    expect(handle.pendingLegal()).toBeNull();
  });

  it('ignores an illegal submit and keeps waiting', () => {
    const handle = createHumanPlayer();
    const s = ticTacToe.applyMove(ticTacToe.createInitialState(variant, {}), 'p1', 0);
    const legal = ticTacToe.legalMoves(s, 'p2'); // [1..8]

    handle.player.getMove(ticTacToe.viewFor(s, 'p2'), legal);
    expect(handle.submit(0)).toBe(false); // 0 is occupied → not legal
    expect(handle.isWaiting()).toBe(true);
    expect(handle.submit(5)).toBe(true);
  });

  it('is a no-op when submit is called with no move pending', () => {
    const handle = createHumanPlayer();
    expect(handle.submit(0)).toBe(false);
    expect(handle.pendingLegal()).toBeNull();
    expect(handle.isWaiting()).toBe(false);
  });
});
