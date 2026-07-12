import type { DailyChallenge } from '@arena/game-core';

import { apiGet, apiPost } from '@/api/client';
import { ensureSession } from '@/store/session';
import { getPlayerToken } from '@/store/settings';

/** Daily challenge + viewer predictions (SPEC §12.5/§12.6). */

export type PredictedSide = 'p1' | 'p2' | 'draw';

export interface DailyState {
  challenge: DailyChallenge;
  streak: number;
  todayCompleted: boolean;
}

export interface DailyClaim {
  completed: boolean;
  streak: number;
  day: string;
}

export interface PredictionResult {
  correct: boolean;
  winner: PredictedSide | null;
}

export interface IntuitionRow {
  nickname: string;
  points: number;
  total: number;
  accuracy: number;
}

/** Today's challenge (server clock) + this browser's streak. */
export function fetchDaily(): Promise<DailyState> {
  return apiGet<DailyState>('/api/daily', { playerToken: getPlayerToken() });
}

/**
 * Claim today's challenge with an already-saved match. The server re-derives the
 * challenge from the date and checks the stored match against it — we are not
 * telling it that we won, we are pointing at a match it already validated.
 */
export function claimDaily(matchId: string): Promise<DailyClaim> {
  return apiPost<DailyClaim>('/api/daily/result', { matchId }, { playerToken: getPlayerToken() });
}

/**
 * Record a prediction against a saved match. Pass the session token captured
 * before saving so the user is never asked to pass Turnstile twice.
 */
export async function submitPrediction(
  matchId: string,
  predicted: PredictedSide,
  sessionToken?: string,
): Promise<PredictionResult> {
  const token = sessionToken ?? (await ensureSession());
  return apiPost<PredictionResult>(
    '/api/prediction',
    { matchId, predicted },
    { token, playerToken: getPlayerToken() },
  );
}

/** „Ranking intuicji" — best predictors (§12.5). */
export function fetchIntuitionLeaderboard(): Promise<IntuitionRow[]> {
  return apiGet<IntuitionRow[]>('/api/predictions/leaderboard');
}
