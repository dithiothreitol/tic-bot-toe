import { Hono } from 'hono';

/** GET /api/health — liveness + feature flags. DB check wired in Stage 6. */
export function healthRoute(deps: { enableOllama?: boolean } = {}): Hono {
  const app = new Hono();
  app.get('/', (c) => c.json({ ok: true, ts: Date.now(), ollama: deps.enableOllama ?? false }));
  return app;
}
