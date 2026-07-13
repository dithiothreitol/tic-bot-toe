import { Hono } from 'hono';

import type { Database } from '../db/client';
import {
  type ArenaTotals,
  FinishDedup,
  bumpArenaTotals,
  clampFinishTokens,
  readArenaTotals,
} from '../lib/arena-totals';
import { LIVE_MODES, type LiveMode, type LiveRegistry } from '../lib/live';

/**
 * GET/POST /api/live — the home-page "arena pulse".
 *
 * Three numbers behind one endpoint because one poll feeds one card:
 *  - `live`   — matches being played right now, split by mode. Ephemeral, from
 *               the in-memory {@link LiveRegistry} (see lib/live) — no DB.
 *  - `totals` — cumulative counters: games played and tokens burned across ALL
 *               finished matches, ranked or not, saved or not (see
 *               lib/arena-totals). Fed by a `/finish` client report, cached
 *               ({@link TOTALS_TTL_MS}); `null` when no DB is configured.
 *
 * A running match is reported by a client heartbeat (POST), so this endpoint is
 * mounted with or without a DB — the live counter must work on its own.
 */

export type LiveTotals = ArenaTotals;

const TOTALS_TTL_MS = 60_000;

export function liveRoute(deps: {
  registry: LiveRegistry;
  db?: Database;
  now?: () => number;
}): Hono {
  const app = new Hono();
  const clock = () => (deps.now ?? Date.now)();

  // Cache + dedup are scoped to this route instance (not module-level), so each
  // built app — and each test — starts clean.
  const dedup = new FinishDedup();
  let totalsCache: { at: number; data: LiveTotals } | null = null;

  const totals = async (now: number): Promise<LiveTotals | null> => {
    if (!deps.db) return null;
    if (totalsCache && now - totalsCache.at < TOTALS_TTL_MS) return totalsCache.data;
    const data = await readArenaTotals(deps.db);
    totalsCache = { at: now, data };
    return data;
  };

  // Home page polls this: live counts + cumulative games/tokens.
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

  // Best-effort "match finished" — folds one completed match into the cumulative
  // games/tokens counters, once per match id. Independent of the ranking save
  // (§14): a match nobody saves still counts here. No-op without a DB.
  app.post('/finish', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      id?: unknown;
      mode?: unknown;
      tokens?: unknown;
    };
    const id = typeof body.id === 'string' ? body.id : '';
    const mode = LIVE_MODES.find((m): m is LiveMode => m === body.mode);
    if (!id || id.length > 100 || !mode) return c.json({ error: 'bad_finish' }, 400);
    // First sighting of this match id only — a repeat report must not double-count.
    if (deps.db && dedup.add(id)) {
      await bumpArenaTotals(deps.db, clampFinishTokens(body.tokens));
      totalsCache = null; // let the next poll reflect the new count promptly
    }
    return c.json({ ok: true });
  });

  return app;
}
