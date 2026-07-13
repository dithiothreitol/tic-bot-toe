import { Hono } from 'hono';

/** GET /api/health — liveness + feature flags. DB check wired in Stage 6. */
export function healthRoute(deps: { enableOllama?: boolean; coach?: boolean } = {}): Hono {
  const app = new Hono();
  app.get('/', (c) =>
    c.json({
      ok: true,
      ts: Date.now(),
      ollama: deps.enableOllama ?? false,
      // Whether the funded AI coach (§12.1) is available — the UI offers it only then.
      coach: deps.coach ?? false,
    }),
  );
  return app;
}
