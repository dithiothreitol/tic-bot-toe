import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { checkRate, rateLimit, resetRateLimits } from './rate-limit';

beforeEach(() => resetRateLimits());

describe('checkRate', () => {
  it('allows up to the limit within the window, then blocks', () => {
    expect(checkRate('k', 2, 1000, 100)).toBe(true);
    expect(checkRate('k', 2, 1000, 100)).toBe(true);
    expect(checkRate('k', 2, 1000, 100)).toBe(false);
  });

  it('frees a slot once the oldest hit ages out of the window', () => {
    expect(checkRate('k2', 1, 1000, 0)).toBe(true);
    expect(checkRate('k2', 1, 1000, 500)).toBe(false);
    expect(checkRate('k2', 1, 1000, 1500)).toBe(true);
  });
});

describe('rateLimit middleware', () => {
  it('returns 429 once the per-window limit is exceeded', async () => {
    let clock = 0;
    const app = new Hono();
    app.use('/x', rateLimit('x', 2, { trustedProxy: false, now: () => clock }));
    app.get('/x', (c) => c.text('ok'));

    expect((await app.request('/x')).status).toBe(200);
    expect((await app.request('/x')).status).toBe(200);
    expect((await app.request('/x')).status).toBe(429);
  });
});
