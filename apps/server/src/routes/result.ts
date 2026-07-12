import { Hono } from 'hono';

import { verifySession } from '../auth/jwt';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { type ResultPayload, submitResult } from '../db/results';
import { clientIp } from '../middleware/rate-limit';

/**
 * POST /api/result — save a match (SPEC §14/§15). JWT required, one-time jti,
 * server replay + sanity + dedup, transactional ratings update when lab=false.
 */
export function resultRoute(deps: { db: Database; config: Config }): Hono {
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

    const ip = clientIp(c, deps.config.trustedProxy);
    const result = await submitResult(deps.db, claims.jti, payload, ip);
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
