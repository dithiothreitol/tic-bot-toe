import { apiPost } from '@/api/client';
import { getPlayerToken } from '@/store/settings';

/**
 * Ask the server to stamp the start of a human match (SPEC §15.3). The token
 * carries the server's clock, so at save time the backend can tell whether
 * enough real time passed for a person to have played those moves.
 *
 * It is bound to our identity, so it must be requested with the same player
 * token the result will be saved with — otherwise the save is rejected.
 *
 * Silent and best-effort: a failure here must never block the game. Without a
 * token the match simply cannot be saved to the ranking, and the save call says so.
 */
export async function fetchStartToken(): Promise<string | null> {
  try {
    const res = await apiPost<{ startToken: string }>(
      '/api/match/start',
      {},
      { playerToken: getPlayerToken() },
    );
    return res.startToken;
  } catch {
    return null;
  }
}
