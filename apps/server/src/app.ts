import { Hono } from 'hono';

import type { Config } from './config';
import type { Database } from './db/client';
import { rateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security';
import { eloHistoryRoute, headToHeadRoute } from './routes/analytics';
import { commentaryRoute } from './routes/commentary';
import { dailyRoute } from './routes/daily';
import { healthRoute } from './routes/health';
import { leaderboardRoute } from './routes/leaderboard';
import { matchStartRoute } from './routes/match';
import { matchesRoute, replayRoute } from './routes/matches';
import { modelRoute } from './routes/model';
import { ogRoute } from './routes/og';
import { ollamaRoute } from './routes/ollama';
import { playerRoute } from './routes/player';
import { predictionRoute, predictionsLeaderboardRoute } from './routes/predictions';
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

  const coachEnabled = deps.config.geminiApiKey !== '';

  const api = new Hono();
  api.route(
    '/health',
    healthRoute({ enableOllama: deps.config.enableOllama, coach: coachEnabled }),
  );
  if (deps.config.enableOllama) {
    api.route('/ollama', ollamaRoute({ fetch: deps.fetch }));
  }
  // Funded AI coach (§12.1) — only when the owner set a Gemini key. Rate-limited
  // hard: every call spends the owner's credits, and it needs no login.
  if (coachEnabled) {
    // Deliberately modest (≈ a couple of matches / hour). The funded coach is a
    // taster, not the main path: past this the client nudges the user toward
    // their OWN model on their OWN provider (unlimited, on their key). Every call
    // here spends the owner's credits, so a tight cap doubles as budget defence.
    api.use(
      '/commentary',
      rateLimit('commentary', 40, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
    );
    api.route(
      '/commentary',
      commentaryRoute({
        gemini: { apiKey: deps.config.geminiApiKey, model: deps.config.geminiModel },
      }),
    );
  }
  api.use(
    '/verify',
    rateLimit('verify', 30, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
  );
  api.route('/verify', verifyRoute({ config: deps.config, fetch: deps.fetch }));
  api.use(
    '/match/*',
    rateLimit('match', 120, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
  );
  api.route('/match', matchStartRoute({ config: deps.config }));

  if (deps.db) {
    api.use(
      '/result',
      rateLimit('result', 60, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
    );
    api.route('/result', resultRoute({ db: deps.db, config: deps.config, now: deps.now }));
    api.use(
      '/player/*',
      rateLimit('player', 30, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
    );
    api.route('/player', playerRoute({ db: deps.db }));
    // Viewer predictions (§12.5): JWT + 60/h per SPEC §14.
    api.use(
      '/prediction',
      rateLimit('prediction', 60, { trustedProxy: deps.config.trustedProxy, now: deps.now }),
    );
    api.route('/prediction', predictionRoute({ db: deps.db, config: deps.config, now: deps.now }));
    api.route('/predictions', predictionsLeaderboardRoute({ db: deps.db }));
    // Daily challenge (§12.6): config derived from the date, no cron.
    api.route('/daily', dailyRoute({ db: deps.db }));
    api.route('/leaderboard', leaderboardRoute({ db: deps.db, now: deps.now }));
    api.route('/model', modelRoute({ db: deps.db }));
    api.route('/elo-history', eloHistoryRoute({ db: deps.db }));
    api.route('/head-to-head', headToHeadRoute({ db: deps.db }));
    api.route('/matches', matchesRoute({ db: deps.db }));
    api.route('/replay', replayRoute({ db: deps.db }));
    api.route('/og', ogRoute({ db: deps.db }));
  }

  app.route('/api', api);
  return app;
}
