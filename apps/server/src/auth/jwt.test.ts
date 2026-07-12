import { describe, expect, it } from 'vitest';

import { newJti, signSession, signStartToken, verifySession, verifyStartToken } from './jwt';

describe('session JWT', () => {
  it('round-trips and preserves the jti', async () => {
    const { token, jti } = await signSession('secret', 60);
    const claims = await verifySession('secret', token);
    expect(claims?.jti).toBe(jti);
    expect(claims?.exp).toBeGreaterThan(0);
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await signSession('secret-1', 60);
    expect(await verifySession('secret-2', token)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifySession('secret', 'not-a-jwt')).toBeNull();
  });

  it('mints unique jti values', () => {
    expect(newJti()).not.toBe(newJti());
  });
});

describe('match-start token (§15.3 pacing)', () => {
  it('round-trips and exposes the server-issued iat', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { token, jti } = await signStartToken('secret', 2700);
    const claims = await verifyStartToken('secret', token);
    expect(claims?.jti).toBe(jti);
    expect(claims?.iat).toBeGreaterThanOrEqual(before);
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await signStartToken('secret-1', 2700);
    expect(await verifyStartToken('secret-2', token)).toBeNull();
  });

  // The two token types must not be interchangeable: a start token is handed out
  // without Turnstile, so accepting it as a session token would bypass the check.
  it('is not accepted as a session token, and vice versa', async () => {
    const { token: start } = await signStartToken('secret', 2700);
    expect(await verifySession('secret', start)).toBeNull();

    const { token: session } = await signSession('secret', 60);
    expect(await verifyStartToken('secret', session)).toBeNull();
  });
});
