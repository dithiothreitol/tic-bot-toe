import type { GameId, Move, PlayerSide, SetupRecord } from '@arena/game-core';

import { ApiError, apiGet, apiPost } from '@/api/client';
import { getPlayerToken } from '@/store/settings';

/** Turing mode — „Kto jest botem?" (Module D, plan §6). */

/** A stripped match to guess on — moves + setup only, NO identities or telemetry. */
export interface TuringPuzzle {
  game: GameId;
  variant: string;
  setup: SetupRecord | null;
  moves: { player: PlayerSide; move: Move }[];
}

export interface TuringNext {
  puzzle: TuringPuzzle;
  /** Signed token carrying the hidden matchId — passed back verbatim on guess. */
  puzzleToken: string;
}

export interface TuringReveal {
  correct: boolean;
  /** Which side was actually the human. */
  humanSide: PlayerSide;
  /** The model that played the other side (now safe to show + link). */
  modelId: string;
  matchId: string;
}

export interface TuringDetective {
  nickname: string;
  correct: number;
  total: number;
  accuracy: number;
}

/**
 * Fetch a puzzle this browser hasn't guessed yet. Returns null when the pool is
 * exhausted (the server's 404 `no_puzzles`) so the page can show an empty state
 * rather than an error toast.
 */
export async function fetchTuringNext(game?: GameId): Promise<TuringNext | null> {
  const qs = game ? `?game=${game}` : '';
  try {
    return await apiGet<TuringNext>(`/api/turing/next${qs}`, { playerToken: getPlayerToken() });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Submit a guess (which side is the human) and get the reveal. */
export function submitTuringGuess(puzzleToken: string, guess: PlayerSide): Promise<TuringReveal> {
  return apiPost<TuringReveal>(
    '/api/turing/guess',
    { puzzleToken, guess },
    { playerToken: getPlayerToken() },
  );
}

/** „Ranking detektywów" — best human-spotters (≥10 guesses). */
export function fetchTuringLeaderboard(): Promise<TuringDetective[]> {
  return apiGet<TuringDetective[]>('/api/turing/leaderboard');
}
