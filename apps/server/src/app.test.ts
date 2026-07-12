import { beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { verifySession } from './auth/jwt';
import { loadConfig } from './config';
import { resetRateLimits } from './middleware/rate-limit';

const config = loadConfig({ JWT_SECRET: 'test-secret', TURNSTILE_SECRET: 'ts-secret' });

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
  it('returns ok', async () => {
    const res = await buildApp({ config }).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
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

describe('security headers (SPEC §16)', () => {
  it('pins a CSP to openrouter + turnstile and sets nosniff', async () => {
    const res = await buildApp({ config }).request('/api/health');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("connect-src 'self' https://openrouter.ai");
    expect(csp).toContain('challenges.cloudflare.com');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
