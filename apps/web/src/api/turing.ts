import type { GameId, Move, PlayerSide, SetupRecord } from '@arena/game-core';

import { apiGet, apiPost } from '@/api/client';
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
 * Fetch a puzzle this browser hasn't guessed yet. The server returns 200 with
 * `puzzle: null` when the pool is exhausted (a normal empty state, not an error —
 * so the browser console stays clean); we surface that as `null` for the page's
 * empty state. Real failures (5xx / network) still reject and bubble up.
 */
export async function fetchTuringNext(game?: GameId): Promise<TuringNext | null> {
  const qs = game ? `?game=${game}` : '';
  const res = await apiGet<{ puzzle: TuringPuzzle | null; puzzleToken?: string }>(
    `/api/turing/next${qs}`,
    { playerToken: getPlayerToken() },
  );
  return res.puzzle && res.puzzleToken
    ? { puzzle: res.puzzle, puzzleToken: res.puzzleToken }
    : null;
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
