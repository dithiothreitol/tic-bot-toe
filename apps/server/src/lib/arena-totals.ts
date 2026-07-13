import { eq, sql } from 'drizzle-orm';

import type { Database } from '../db/client';
import { arenaTotals } from '../db/schema';

/**
 * Cumulative arena counters (games played + tokens burned) shown on the home
 * page. Unlike the ranking totals, these count EVERY finished match — saved or
 * not — because most games (unranked model duels, quick human games nobody
 * saves) never reach the `ratings` table. The count is therefore fed by a
 * best-effort client report at match end (routes/live `/finish`), which makes it
 * a soft public vanity stat, not a verified ledger — the same trust model as the
 * live "in progress" counter. The guards below bound abuse, not eliminate it.
 */

/** Fixed key of the single counters row. */
const GLOBAL = 'global';

/**
 * Upper bound on tokens accepted from one finish report. A long battleship match
 * between two chatty reasoning models is comfortably under this; the cap only
 * stops a bogus client from ballooning the public number in a single call.
 */
export const MAX_FINISH_TOKENS = 5_000_000;

/** Normalize a reported token count to a sane, non-negative integer ≤ the cap. */
export function clampFinishTokens(tokens: unknown): number {
  const n = typeof tokens === 'number' && Number.isFinite(tokens) ? Math.floor(tokens) : 0;
  if (n <= 0) return 0;
  return Math.min(n, MAX_FINISH_TOKENS);
}

export interface ArenaTotals {
  games: number;
  tokens: number;
}

/**
 * Remembers match ids already counted, so a repeated finish report — React
 * StrictMode double-fire, a quick retry, a re-mount — cannot inflate the tally.
 * Bounded and in-memory: a soft guard for a vanity stat, not a persistent
 * ledger. A restart forgets everything, which at worst re-counts a match that
 * happens to finish right after the restart — acceptable for this number.
 */
export class FinishDedup {
  private readonly seen = new Set<string>();

  constructor(private readonly max = 50_000) {}

  /** True the FIRST time an id is seen (caller should count it); false on repeats. */
  add(id: string): boolean {
    if (this.seen.has(id)) return false;
    // Cheap bound: once full, drop the whole window. Ids are short-lived, so the
    // worst case is a rare double-count right after a wrap, not unbounded memory.
    if (this.seen.size >= this.max) this.seen.clear();
    this.seen.add(id);
    return true;
  }
}

/**
 * Fold one finished match into the counters: games += 1, tokens += `tokens`.
 * Upserts the single row so the first call after a fresh DB still works. Atomic
 * at the SQL level, so concurrent finishes never lose an increment.
 */
export async function bumpArenaTotals(db: Database, tokens: number): Promise<void> {
  const t = clampFinishTokens(tokens);
  await db
    .insert(arenaTotals)
    .values({ id: GLOBAL, games: 1, tokens: t })
    .onConflictDoUpdate({
      target: arenaTotals.id,
      set: {
        games: sql`${arenaTotals.games} + 1`,
        tokens: sql`${arenaTotals.tokens} + ${t}`,
        updatedAt: sql`now()`,
      },
    });
}

/** Read the cumulative counters; zeros when the row does not exist yet. */
export async function readArenaTotals(db: Database): Promise<ArenaTotals> {
  const rows = await db
    .select({ games: arenaTotals.games, tokens: arenaTotals.tokens })
    .from(arenaTotals)
    .where(eq(arenaTotals.id, GLOBAL));
  return {
    games: Number(rows[0]?.games ?? 0),
    tokens: Number(rows[0]?.tokens ?? 0),
  };
}
