import { Hono } from 'hono';

import { signSession } from '../auth/jwt';
import { verifyTurnstile } from '../auth/turnstile';
import type { Config } from '../config';
import { clientIp } from '../middleware/rate-limit';

export interface VerifyDeps {
  config: Config;
  fetch?: typeof fetch;
}

/**
 * POST /api/verify — Turnstile siteverify → session JWT (SPEC §14).
 * Body: { token }. Returns { token, expiresIn } on success, 403 otherwise.
 */
export function verifyRoute(deps: VerifyDeps): Hono {
  const app = new Hono();
  app.post('/', async (c) => {
    let body: { token?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    const token = typeof body.token === 'string' ? body.token : '';
    const ip = clientIp(c, deps.config.trustedProxy);

    const ok = await verifyTurnstile(
      deps.config.turnstileSecret,
      token,
      ip,
      deps.fetch ?? fetch,
    );
    if (!ok) return c.json({ error: 'turnstile_failed' }, 403);

    const { token: jwt } = await signSession(
      deps.config.jwtSecret,
      deps.config.jwtTtlSeconds,
    );
    return c.json({ token: jwt, expiresIn: deps.config.jwtTtlSeconds });
  });
  return app;
}
