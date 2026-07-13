import { beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { verifySession } from './auth/jwt';
import { loadConfig } from './config';
import { resetRateLimits } from './middleware/rate-limit';

const TEST_ENV = { JWT_SECRET: 'test-secret', TURNSTILE_SECRET: 'ts-secret' };
const config = loadConfig(TEST_ENV);
const configWithCoach = loadConfig({ ...TEST_ENV, GEMINI_COACH_API_KEY: 'k' });

function turnstileFetch(success: boolean): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => ({ success }),
  })) as unknown as typeof fetch;
}

function postVerify(app: ReturnType<typeof buildApp>, token: string) {
  return app.request('/api/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

beforeEach(() => resetRateLimits());

describe('GET /api/health', () => {
  it('returns ok, with the coach off when no Gemini key is set', async () => {
    const res = await buildApp({ config }).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, coach: false });
  });

  it('advertises the coach only when a Gemini key is configured', async () => {
    const res = await buildApp({ config: configWithCoach }).request('/api/health');
    expect(await res.json()).toMatchObject({ coach: true });
  });
});

describe('POST /api/commentary (funded coach)', () => {
  it('is not mounted without a Gemini key', async () => {
    const res = await buildApp({ config }).request('/api/commentary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('is mounted when a Gemini key is set (400 on an empty body, not 404)', async () => {
    const res = await buildApp({ config: configWithCoach }).request('/api/commentary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/verify (Turnstile → JWT)', () => {
  it('issues a valid session JWT when Turnstile passes', async () => {
    const app = buildApp({ config, fetch: turnstileFetch(true) });
    const res = await postVerify(app, 'tok');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresIn: number };
    expect(body.expiresIn).toBe(30 * 60);
    const claims = await verifySession('test-secret', body.token);
    expect(claims?.jti).toBeTruthy();
  });

  it('rejects with 403 when Turnstile fails', async () => {
    const app = buildApp({ config, fetch: turnstileFetch(false) });
    expect((await postVerify(app, 'bad')).status).toBe(403);
  });

  it('returns 400 on a non-JSON body', async () => {
    const app = buildApp({ config, fetch: turnstileFetch(true) });
    const res = await app.request('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('/api/live (arena pulse)', () => {
  const postLive = (app: ReturnType<typeof buildApp>, body: unknown, path = '/api/live') =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('starts empty, with null totals when no DB is configured', async () => {
    const res = await buildApp({ config }).request('/api/live');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      live: { model_vs_model: 0, human_vs_model: 0, total: 0 },
      totals: null,
    });
  });

  it('counts a heartbeat and splits it by mode', async () => {
    const app = buildApp({ config });
    await postLive(app, { id: 'm1', mode: 'model_vs_model' });
    await postLive(app, { id: 'h1', mode: 'human_vs_model' });
    const res = await app.request('/api/live');
    expect(await res.json()).toMatchObject({
      live: { model_vs_model: 1, human_vs_model: 1, total: 2 },
    });
  });

  it('drops a match on /stop', async () => {
    const app = buildApp({ config });
    await postLive(app, { id: 'm1', mode: 'model_vs_model' });
    await postLive(app, { id: 'm1' }, '/api/live/stop');
    const res = await app.request('/api/live');
    expect(await res.json()).toMatchObject({ live: { total: 0 } });
  });

  it('rejects a heartbeat with a bad mode', async () => {
    const res = await postLive(buildApp({ config }), { id: 'm1', mode: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('security headers (SPEC §16)', () => {
  it('pins a CSP to openrouter + turnstile and sets nosniff', async () => {
    const res = await buildApp({ config }).request('/api/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("connect-src 'self' https://openrouter.ai");
    expect(csp).toContain('challenges.cloudflare.com');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
