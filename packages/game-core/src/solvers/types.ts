import type { GameId, Move, MoveQuality, PlayerSide } from '../types';

export interface MoveAnalysis {
  index: number;
  player: PlayerSide;
  move: Move;
  quality: MoveQuality;
}

export interface PlayerAccuracy {
  moves: number;
  optimal: number;
  /** optimal / moves, 0 when the player made no moves. */
  rate: number;
}

export interface GameAnalysis {
  game: GameId;
  moves: MoveAnalysis[];
  accuracy: Record<PlayerSide, PlayerAccuracy>;
  /** Index of the earliest blunder (the "turning point", §12.2), or null. */
  turningPoint: number | null;
}
