import { DAILY_OPPONENTS } from '@arena/game-core';

/**
 * Which daily-pool OpenRouter ids are DEAD — gone from the live catalog.
 *
 * Free `:free` variants get retired without notice (we lost both meta-llama
 * entries in one summer). The pool pick runs through `dailyChallenge(day,
 * { deadOpponentIds })`, so a retired model must never land in that set late:
 * GET (serving the challenge) and POST (verifying the claim) both consult this
 * provider, and if the two saw different sets the player could be refused a
 * challenge they legitimately won. Hence the pinning:
 *
 *   - the first successful catalog fetch of a UTC day pins the dead set for
 *     that whole day — later catalog changes wait for tomorrow;
 *   - a failed fetch pins NOTHING and returns the empty set, i.e. the
 *     unfiltered pool (yesterday's behavior). The client-side retired check
 *     (DailyChallengeCard) still hides a dead pick in that window, and the
 *     claim route additionally accepts the unfiltered pick, so a restart
 *     mid-day cannot orphan a match already played.
 */
export type DeadOpponents = (day: string) => Promise<ReadonlySet<string>>;

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const EMPTY: ReadonlySet<string> = new Set();

export function catalogDeadOpponents(fetchImpl: typeof fetch = fetch): DeadOpponents {
  let pinned: { day: string; dead: ReadonlySet<string> } | null = null;

  return async (day) => {
    if (pinned?.day === day) return pinned.dead;
    try {
      const res = await fetchImpl(MODELS_URL);
      if (!res.ok) throw new Error(`OpenRouter /models → ${res.status}`);
      const data = ((await res.json()) as { data?: Array<{ id?: unknown }> }).data;
      const liveIds = new Set(
        (Array.isArray(data) ? data : [])
          .map((m) => m?.id)
          .filter((id): id is string => typeof id === 'string'),
      );
      // An empty catalog is a broken response, not 340 retired models.
      if (liveIds.size === 0) throw new Error('OpenRouter /models → empty catalog');

      const dead: ReadonlySet<string> = new Set(
        DAILY_OPPONENTS.filter((o) => o.provider === 'openrouter' && !liveIds.has(o.id)).map(
          (o) => o.id,
        ),
      );
      pinned = { day, dead };
      return dead;
    } catch {
      return EMPTY; // catalog unreachable — don't accuse the pool; retry on the next request
    }
  };
}
