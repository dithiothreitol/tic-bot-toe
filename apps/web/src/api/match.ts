import { apiPost } from '@/api/client';

/**
 * Ask the server to stamp the start of a human match (SPEC §15.3). The token
 * carries the server's clock, so at save time the backend can tell whether
 * enough real time passed for a person to have played those moves.
 *
 * Silent and best-effort: a failure here must never block the game. Without a
 * token the match simply cannot be saved to the ranking, and the save call says so.
 */
export async function fetchStartToken(): Promise<string | null> {
  try {
    const res = await apiPost<{ startToken: string }>('/api/match/start', {});
    return res.startToken;
  } catch {
    return null;
  }
}
