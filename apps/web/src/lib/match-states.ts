import {
  type AnalyzedMove,
  type GameDefinition,
  type GameId,
  type Move,
  type SetupRecord,
  getGame,
} from '@arena/game-core';

function configFromSetup(setup: SetupRecord | null) {
  if (!setup) return {};
  return {
    seed: typeof setup.seed === 'number' ? setup.seed : undefined,
    extraShotOnHit: typeof setup.extraShotOnHit === 'boolean' ? setup.extraShotOnHit : undefined,
    placements: setup.placements,
  };
}

/**
 * Replay a match through the engine, returning the state after each move.
 * `states[0]` is the initial position, `states[k]` is after k moves.
 * Shared by the analysis view and the public replay player.
 */
export function reconstructStates(
  game: GameId,
  variantId: string,
  setup: SetupRecord | null,
  moves: AnalyzedMove[],
): unknown[] {
  const def = getGame(game) as unknown as GameDefinition<unknown, Move>;
  const variantObj = def.variants.find((v) => v.id === variantId) ?? {
    id: variantId,
    label: variantId,
  };
  let st = def.createInitialState(variantObj, configFromSetup(setup));
  const arr: unknown[] = [st];
  for (const m of moves) {
    st = def.applyMove(st, m.player, m.move);
    arr.push(st);
  }
  return arr;
}
