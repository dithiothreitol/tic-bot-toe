import { Hono } from 'hono';

import { verifySession, verifyStartToken } from '../auth/jwt';
import { type PlayerRecord, isValidPlayerToken, resolvePlayer } from '../auth/player';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { type ResultPayload, submitResult } from '../db/results';
import { clientIp } from '../middleware/rate-limit';

/**
 * POST /api/result — save a match (SPEC §14/§15). JWT required, one-time jti,
 * server replay + sanity + dedup, transactional ratings update when lab=false.
 */
export function resultRoute(deps: { db: Database; config: Config; now?: () => number }): Hono {
  const app = new Hono();
  app.post('/', async (c) => {
    const auth = c.req.header('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const claims = await verifySession(deps.config.jwtSecret, token);
    if (!claims) return c.json({ error: 'unauthorized' }, 401);

    let payload: ResultPayload;
    try {
      payload = (await c.req.json()) as ResultPayload;
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }

    // Optional pseudonymous identity: resolves the human side to one ranking row.
    let player: PlayerRecord | null = null;
    const playerToken = c.req.header('x-player-token');
    if (playerToken) {
      if (!isValidPlayerToken(playerToken)) {
        return c.json({ error: 'bad_player_token' }, 400);
      }
      player = await resolvePlayer(deps.db, playerToken);
    }

    // Match-start proof (§15.3). An invalid/expired token is treated as absent;
    // submitResult decides whether this match actually needed one.
    const start = payload.startToken
      ? await verifyStartToken(deps.config.jwtSecret, payload.startToken)
      : null;

    const ip = clientIp(c, deps.config.trustedProxy);
    const result = await submitResult(deps.db, claims.jti, payload, ip, {
      player,
      start,
      now: deps.now,
    });
    if (!result.ok) return c.json({ error: result.reason }, result.code);
    return c.json({
      matchId: result.matchId,
      winner: result.winner,
      lab: result.lab,
      ratingChanges: result.ratingChanges,
    });
  });
  return app;
}
