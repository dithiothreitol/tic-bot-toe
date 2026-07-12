import { eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';

import { isValidPlayerToken, resolvePlayer } from '../auth/player';
import type { Database } from '../db/client';
import { players } from '../db/schema';
import { validateNickname } from '../lib/nickname';

/**
 * Player profile (SPEC §10/§16). Pseudonymous: identity is the `X-Player-Token`
 * bearer secret; no Turnstile here (this is not a ranking write). Rate limited
 * upstream. A player without a nickname stays out of the human leaderboard.
 */
function playerFromHeader(c: Context): string | null {
  const token = c.req.header('x-player-token');
  return token && isValidPlayerToken(token) ? token : null;
}

/**
 * Postgres unique-violation (23505). Drizzle wraps driver errors, so the code
 * can sit on the error itself or on its `cause`.
 */
function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 4; depth++) {
    if ((cur as { code?: unknown }).code === '23505') return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export function playerRoute(deps: { db: Database }): Hono {
  const app = new Hono();

  app.get('/me', async (c) => {
    const token = playerFromHeader(c);
    if (!token) return c.json({ error: 'bad_player_token' }, 400);
    const p = await resolvePlayer(deps.db, token);
    return c.json({ id: p.id, nickname: p.nickname, flagged: p.flaggedAt !== null });
  });

  app.post('/nickname', async (c) => {
    const token = playerFromHeader(c);
    if (!token) return c.json({ error: 'bad_player_token' }, 400);

    let body: { nickname?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    if (typeof body.nickname !== 'string') return c.json({ error: 'bad_request' }, 400);

    const check = validateNickname(body.nickname);
    if (!check.ok) return c.json({ error: check.error }, 400);

    const p = await resolvePlayer(deps.db, token);
    try {
      await deps.db.update(players).set({ nickname: check.value }).where(eq(players.id, p.id));
    } catch (e) {
      // Unique violation on the nickname index → taken by another player.
      if (isUniqueViolation(e)) return c.json({ error: 'nickname_taken' }, 409);
      throw e;
    }
    return c.json({ id: p.id, nickname: check.value, flagged: p.flaggedAt !== null });
  });

  app.delete('/nickname', async (c) => {
    const token = playerFromHeader(c);
    if (!token) return c.json({ error: 'bad_player_token' }, 400);
    const p = await resolvePlayer(deps.db, token);
    await deps.db.update(players).set({ nickname: null }).where(eq(players.id, p.id));
    return c.json({ id: p.id, nickname: null, flagged: p.flaggedAt !== null });
  });

  return app;
}
