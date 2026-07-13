import { type RequestOpts, apiGet, apiPost } from '@/api/client';

/**
 * The home-page "arena pulse" (see server `routes/live`). Two numbers, one poll:
 * matches in progress right now (from a client heartbeat) and the cumulative
 * tokens models have burned across ranked matches.
 *
 * Everything here is best-effort: the pulse is a nice-to-have, so a failure must
 * never surface an error or block a game.
 */

export type LiveMode = 'model_vs_model' | 'human_vs_model';

export interface LiveCounts {
  model_vs_model: number;
  human_vs_model: number;
  total: number;
}

export interface LiveStats {
  live: LiveCounts;
  /** `null` when the server has no ranking DB configured. */
  totals: { tokens: number } | null;
}

/** Home-page poll: live counts + cumulative token spend. */
export function fetchLiveStats(opts?: RequestOpts): Promise<LiveStats> {
  return apiGet<LiveStats>('/api/live', {}, opts);
}

/**
 * Heartbeat: tell the server this tab is mid-match. `id` is an opaque per-match
 * id (a random UUID) — no identity is sent. Swallows errors: a missed beat just
 * means the match falls off the counter a little sooner.
 */
export async function pingLive(id: string, mode: LiveMode, opts?: RequestOpts): Promise<void> {
  try {
    await apiPost('/api/live', { id, mode }, {}, opts);
  } catch {
    /* best-effort */
  }
}

/** Best-effort "match ended" — drops the entry so the counter falls at once. */
export function stopLive(id: string): void {
  void apiPost('/api/live/stop', { id }).catch(() => {});
}
