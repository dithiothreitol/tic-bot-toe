/**
 * Daily challenge (SPEC §12.6).
 *
 * The whole configuration is DERIVED FROM THE DATE — no cron, no stored
 * schedule, no randomness. `dailyChallenge('2026-07-12')` returns the same
 * challenge on every machine, forever. That is what lets the browser show the
 * challenge and the server independently verify that a submitted match really
 * is today's challenge, without the two ever talking about it.
 *
 * Lives in game-core (not the web app) precisely because both sides need it.
 */
import { BATTLESHIP_VARIANTS_CONFIG } from './battleship';
import { SUDOKU_VARIANTS_CONFIG } from './sudoku';
import type { GameId } from './types';

/** Opponent pool: free only, so the challenge never costs the player money (§12.6). */
export interface DailyOpponent {
  provider: 'webllm' | 'openrouter';
  /** Model id within the provider (MLC id / OpenRouter id). */
  id: string;
  name: string;
}

/**
 * WebLLM models run in the browser with no key at all; the `:free` OpenRouter
 * variants need a key but cost nothing. Keeping both means the challenge is
 * playable whether the user has WebGPU or a key.
 *
 * ⚠ THE OPENROUTER IDS ROT. Free variants get retired without notice (we already
 * lost `mistralai/mistral-7b-instruct:free`), and the ones that survive are
 * aggressively rate-limited. Both failure modes look identical to the game: the
 * call fails, the runner retries, and the "opponent" ends up playing forfeited
 * random moves — which would hand the player a fake win.
 *
 * That is defended in two places, NOT by hoping this list stays fresh:
 *   - the server refuses to complete a challenge whose opponent never made a
 *     single real move (`opponent_never_played`, routes/daily.ts);
 *   - the client hides the challenge when today's OpenRouter opponent is no
 *     longer in the live catalog (DailyChallengeCard).
 * Run `pnpm daily:check` to see rot before your users do.
 *
 * WebLLM ids are stable (they are pinned MLC builds) — keep at least one in the
 * pool so the challenge survives even a total OpenRouter outage.
 */
export const DAILY_OPPONENTS: readonly DailyOpponent[] = [
  { provider: 'webllm', id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B' },
  { provider: 'webllm', id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 mini' },
  { provider: 'webllm', id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 3B' },
  {
    provider: 'openrouter',
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    name: 'Llama 3.2 3B (free)',
  },
  {
    provider: 'openrouter',
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (free)',
  },
  { provider: 'openrouter', id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B (free)' },
  { provider: 'openrouter', id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)' },
] as const;

export interface DailyChallenge {
  /** The seed: ISO date `YYYY-MM-DD`. */
  day: string;
  game: GameId;
  variant: string;
  opponent: DailyOpponent;
  /** The player always moves first — same handicap for everyone. */
  humanSide: 'p1';
}

/** The ranking subject id this opponent plays under (`webllm:…`, `openrouter:…`). */
export function dailySubjectId(opponent: DailyOpponent): string {
  return `${opponent.provider}:${opponent.id}`;
}

/**
 * The paid twin of a `:free` opponent — same weights, paid endpoint.
 *
 * The whole `:free` tier shares one aggressive rate limit, and a 429 storm
 * turns the opponent into a forfeiting ghost: the server then (correctly)
 * refuses the day, which is fair but brutal for the player's streak. The
 * escape hatch is playing the SAME model on its paid id, billed to the
 * player's own OpenRouter key. OpenRouter's naming makes the twin derivable
 * (`<id>:free` ⇄ `<id>`), so there is no hand-maintained mapping to rot.
 *
 * `null` when there is nothing to swap to: WebLLM runs locally and never
 * rate-limits, and a non-`:free` id is already paid.
 */
export function paidEquivalent(opponent: DailyOpponent): DailyOpponent | null {
  if (opponent.provider !== 'openrouter' || !opponent.id.endsWith(':free')) return null;
  return {
    provider: 'openrouter',
    id: opponent.id.slice(0, -':free'.length),
    name: opponent.name.replace(/\s*\(free\)$/i, ''),
  };
}

/**
 * Every subject id that counts as "today's opponent": the pool entry plus its
 * paid twin. Both the client (offering the swap) and the server (verifying a
 * claimed match) go through this list, so a paid-twin win completes the same
 * day the free win would.
 */
export function dailyAcceptedSubjectIds(challenge: DailyChallenge): string[] {
  const ids = [dailySubjectId(challenge.opponent)];
  const paid = paidEquivalent(challenge.opponent);
  if (paid) ids.push(dailySubjectId(paid));
  return ids;
}

/** FNV-1a — small, stable, and identical in every JS runtime. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Each choice gets its own salted hash, so game/variant/opponent don't correlate. */
function pick<T>(items: readonly T[], day: string, salt: string): T {
  return items[hash32(`${day}#${salt}`) % items.length]!;
}

// Sudoku joins the pool (plan §2.9); scrabble does NOT (free models too weak +
// dictionary download). Growing the pool from 2→3 shifts which challenge each
// past date maps to (hash % length) — harmless (results are stored per day) but
// the deploy must be atomic (one server serves front + API — it is).
const GAMES: readonly GameId[] = ['tictactoe', 'battleship', 'sudoku'] as const;
const BATTLESHIP_VARIANT_IDS: readonly string[] = Object.keys(BATTLESHIP_VARIANTS_CONFIG);
const SUDOKU_VARIANT_IDS: readonly string[] = Object.keys(SUDOKU_VARIANTS_CONFIG);

/** `YYYY-MM-DD` — anything else would silently produce a different challenge. */
export function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

/**
 * Today's challenge, derived purely from the date.
 * @param day ISO `YYYY-MM-DD` (the caller owns "what day is it" — game-core has no clock).
 */
export function dailyChallenge(day: string): DailyChallenge {
  if (!isValidDay(day)) throw new Error(`dailyChallenge: expected YYYY-MM-DD, got "${day}"`);

  const game = pick(GAMES, day, 'game');
  const variant =
    game === 'battleship'
      ? pick(BATTLESHIP_VARIANT_IDS, day, 'variant')
      : game === 'sudoku'
        ? pick(SUDOKU_VARIANT_IDS, day, 'variant')
        : 'standard';
  const opponent = pick(DAILY_OPPONENTS, day, 'opponent');

  return { day, game, variant, opponent, humanSide: 'p1' };
}

/** `YYYY-MM-DD` for a Date, in UTC — the server's notion of "today". */
export function toDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive-day streak ending today. If today is not done yet the streak is
 * still alive — it just counts back from yesterday, so a pending day never
 * looks like a broken streak.
 */
export function streakFrom(completedDays: Iterable<string>, today: string): number {
  const done = new Set(completedDays);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (!done.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (done.has(toDayString(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
