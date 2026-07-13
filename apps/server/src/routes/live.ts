import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { ratings } from '../db/schema';
import { LIVE_MODES, type LiveMode, type LiveRegistry } from '../lib/live';

/**
 * GET/POST /api/live — the home-page "arena pulse".
 *
 * Two very different numbers live behind one endpoint because one poll feeds one
 * card:
 *  - `live`   — matches being played right now, split by mode. Ephemeral, from
 *               the in-memory {@link LiveRegistry} (see lib/live) — no DB.
 *  - `totals` — cumulative telemetry from the ranking (`ratings`): how many
 *               tokens the models have burned across all ranked matches. Slow to
 *               move, so it is cached ({@link TOTALS_TTL_MS}); `null` when the DB
 *               is not configured (ranking endpoints are then off anyway).
 *
 * A running match is reported by a client heartbeat (POST), so this endpoint is
 * mounted with or without a DB — the live counter must work on its own.
 */

export interface LiveTotals {
  /** Sum of `ratings.tokens_sum` — tokens spent by models in ranked matches. */
  tokens: number;
}

const TOTALS_TTL_MS = 60_000;
let totalsCache: { at: number; data: LiveTotals } | null = null;

/** Test hook — the cache is module-level, so tests reset it between cases. */
export function resetLiveTotalsCache(): void {
  totalsCache = null;
}

async function readTotals(db: Database, now: number): Promise<LiveTotals> {
  if (totalsCache && now - totalsCache.at < TOTALS_TTL_MS) return totalsCache.data;
  // Each subject's row holds only its own side's tokens, so summing every row
  // counts a match's two models once each — no double counting. Humans carry no
  // token telemetry, so their rows contribute ~0.
  const rows = await db
    .select({ tokens: sql<string>`COALESCE(SUM(${ratings.tokensSum}), 0)` })
    .from(ratings);
  const data: LiveTotals = { tokens: Number(rows[0]?.tokens ?? 0) };
  totalsCache = { at: now, data };
  return data;
}

export function liveRoute(deps: {
  registry: LiveRegistry;
  db?: Database;
  now?: () => number;
}): Hono {
  const app = new Hono();
  const clock = () => (deps.now ?? Date.now)();

  const totals = async (now: number): Promise<LiveTotals | null> =>
    deps.db ? readTotals(deps.db, now) : null;

  // Home page polls this: live counts + cumulative token spend.
  app.get('/', async (c) => {
    const now = clock();
    return c.json({ live: deps.registry.counts(now), totals: await totals(now) });
  });

  // Heartbeat from a playing tab: { id, mode }. `id` is an opaque, client-chosen
  // match id — no identity, nothing kept past its TTL. Returns just the live
  // block (the player's tab shows nothing from it; keeping it DB-free stays lean).
  app.post('/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: unknown; mode?: unknown };
    const id = typeof body.id === 'string' ? body.id : '';
    const mode = LIVE_MODES.find((m): m is LiveMode => m === body.mode);
    if (!id || id.length > 100 || !mode) return c.json({ error: 'bad_ping' }, 400);
    const now = clock();
    deps.registry.ping(id, mode, now);
    return c.json({ live: deps.registry.counts(now) });
  });

  // Best-effort "match ended" — drops the entry so the counter falls at once
  // instead of waiting out the TTL.
  app.post('/stop', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: unknown };
    if (typeof body.id === 'string') deps.registry.drop(body.id);
    return c.json({ ok: true });
  });

  return app;
}
