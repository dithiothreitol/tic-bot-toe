import { Hono } from 'hono';

/**
 * Ollama proxy (SPEC §2.3): forwards to the local Ollama daemon, behind the
 * ENABLE_OLLAMA flag. Ollama is the ONLY provider that spends the owner's CPU,
 * so requests are serialized — max 1 concurrent inference (single-flight queue).
 */
const OLLAMA_BASE = 'http://127.0.0.1:11434';

let chain: Promise<unknown> = Promise.resolve();

/** Run `fn` after all previously-queued jobs (max 1 concurrent). */
export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  // Keep the chain alive regardless of individual outcomes.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function ollamaRoute(deps: { fetch?: typeof fetch } = {}): Hono {
  const doFetch = deps.fetch ?? fetch;
  const app = new Hono();

  app.get('/tags', async (c) => {
    try {
      const res = await doFetch(`${OLLAMA_BASE}/api/tags`);
      return c.json((await res.json()) as object, res.ok ? 200 : 502);
    } catch {
      return c.json({ error: 'ollama_unreachable' }, 502);
    }
  });

  app.post('/chat', async (c) => {
    let body: Record<string, unknown> | null;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    return enqueue(async () => {
      try {
        const res = await doFetch(`${OLLAMA_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, stream: false }),
        });
        return c.json((await res.json()) as object, res.ok ? 200 : 502);
      } catch {
        return c.json({ error: 'ollama_unreachable' }, 502);
      }
    });
  });

  return app;
}
