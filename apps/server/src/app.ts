import { Hono } from 'hono';

import type { Config } from './config';
import { rateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security';
import { healthRoute } from './routes/health';
import { verifyRoute } from './routes/verify';

export interface AppDeps {
  config: Config;
  /** Injectable fetch (Turnstile) for tests. */
  fetch?: typeof fetch;
  /** Injectable clock (rate limiter) for tests. */
  now?: () => number;
}

/** Build the API app (no listener) — used by index.ts and by tests. */
export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.use('*', securityHeaders());

  const api = new Hono();
  api.route('/health', healthRoute());
  api.use(
    '/verify',
    rateLimit('verify', 30, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
  );
  api.route('/verify', verifyRoute({ config: deps.config, fetch: deps.fetch }));

  app.route('/api', api);
  return app;
}
