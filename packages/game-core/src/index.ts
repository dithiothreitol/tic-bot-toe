/**
 * @arena/game-core — public API.
 *
 * Pure TypeScript engines shared by the browser (playing) and the server
 * (replay validation). Add new games by implementing GameDefinition and
 * registering them in `getGame`.
 */

export * from './types';
export * from './rng';
export * from './lexicon-registry';
export * from './tictactoe';
export * from './battleship';
export * from './sudoku';
export * from './scrabble';
export * from './scrabble-data';
export * from './elo';
export * from './replay';
export * from './solvers';
export * from './daily';
export * from './commentary';

import type { GameId } from './types';
import { battleship } from './battleship';
import { scrabble } from './scrabble';
import { sudoku } from './sudoku';
import { ticTacToe } from './tictactoe';

/** Resolve a game engine by id. Return type narrows per game. */
export function getGame(id: GameId) {
  switch (id) {
    case 'tictactoe':
      return ticTacToe;
    case 'battleship':
      return battleship;
    case 'sudoku':
      return sudoku;
    case 'scrabble':
      return scrabble;
    default:
      throw new Error(`Unknown game: ${id as string}`);
  }
}
