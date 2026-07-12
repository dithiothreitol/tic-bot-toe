import { Hono } from 'hono';

import type { Config } from './config';
import type { Database } from './db/client';
import { rateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security';
import { eloHistoryRoute, headToHeadRoute } from './routes/analytics';
import { healthRoute } from './routes/health';
import { leaderboardRoute } from './routes/leaderboard';
import { matchesRoute, replayRoute } from './routes/matches';
import { ogRoute } from './routes/og';
import { ollamaRoute } from './routes/ollama';
import { resultRoute } from './routes/result';
import { verifyRoute } from './routes/verify';

export interface AppDeps {
  config: Config;
  /** When absent, ranking endpoints are not mounted (DB not configured). */
  db?: Database;
  /** Injectable fetch (Turnstile) for tests. */
  fetch?: typeof fetch;
  /** Injectable clock (rate limiter, leaderboard cache) for tests. */
  now?: () => number;
}

/** Build the API app (no listener) — used by index.ts and by tests. */
export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.use('*', securityHeaders());

  const api = new Hono();
  api.route('/health', healthRoute({ enableOllama: deps.config.enableOllama }));
  if (deps.config.enableOllama) {
    api.route('/ollama', ollamaRoute({ fetch: deps.fetch }));
  }
  api.use(
    '/verify',
    rateLimit('verify', 30, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
  );
  api.route('/verify', verifyRoute({ config: deps.config, fetch: deps.fetch }));

  if (deps.db) {
    api.use(
      '/result',
      rateLimit('result', 60, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
    );
    api.route('/result', resultRoute({ db: deps.db, config: deps.config }));
    api.route('/leaderboard', leaderboardRoute({ db: deps.db, now: deps.now }));
    api.route('/elo-history', eloHistoryRoute({ db: deps.db }));
    api.route('/head-to-head', headToHeadRoute({ db: deps.db }));
    api.route('/matches', matchesRoute({ db: deps.db }));
    api.route('/replay', replayRoute({ db: deps.db }));
    api.route('/og', ogRoute({ db: deps.db }));
  }

  app.route('/api', api);
  return app;
}
