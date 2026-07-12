/**
 * @arena/game-core — public API.
 *
 * Pure TypeScript engines shared by the browser (playing) and the server
 * (replay validation). Add new games by implementing GameDefinition and
 * registering them in `getGame`.
 */

export * from './types';
export * from './tictactoe';

import type { GameId } from './types';
import { ticTacToe } from './tictactoe';

/** Resolve a game engine by id. Return type narrows per game. */
export function getGame(id: GameId) {
  switch (id) {
    case 'tictactoe':
      return ticTacToe;
    default:
      throw new Error(`Unknown game: ${id as string}`);
  }
}
