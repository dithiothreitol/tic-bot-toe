import { Hono } from 'hono';

import { signStartToken } from '../auth/jwt';
import type { Config } from '../config';

/**
 * POST /api/match/start — hand out a match-start token (SPEC §15.3).
 *
 * This is the anti-bot pacing anchor: the token carries the server's `iat`, so
 * when the result is submitted we know how much real time actually elapsed. A
 * script can fake per-move latency in the payload, but it cannot fake the clock.
 * No Turnstile here — it is a silent fetch at match start, only rate limited.
 */
export function matchStartRoute(deps: { config: Config }): Hono {
  const app = new Hono();
  app.post('/start', async (c) => {
    const { token } = await signStartToken(deps.config.jwtSecret, deps.config.startTtlSeconds);
    return c.json({ startToken: token, expiresIn: deps.config.startTtlSeconds });
  });
  return app;
}
