import { describe, expect, it } from 'vitest';

import { newJti, signSession, verifySession } from './jwt';

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
