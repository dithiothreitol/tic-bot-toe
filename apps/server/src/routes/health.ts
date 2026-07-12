import { Hono } from 'hono';

/** GET /api/health — liveness ping. DB check is wired in Stage 6. */
export function healthRoute(): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json({ ok: true, ts: Date.now() }));
  return app;
}
