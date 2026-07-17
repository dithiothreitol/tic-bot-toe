import { describe, expect, it } from 'vitest';

import {
  newJti,
  signPuzzleToken,
  signSession,
  signStartToken,
  verifyPuzzleToken,
  verifySession,
  verifyStartToken,
} from './jwt';

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

describe('turing puzzle token (Module D, D8)', () => {
  it('round-trips and carries the matchId', async () => {
    const token = await signPuzzleToken('secret', 1800, 'match-123');
    const claims = await verifyPuzzleToken('secret', token);
    expect(claims?.matchId).toBe('match-123');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signPuzzleToken('secret-1', 1800, 'm');
    expect(await verifyPuzzleToken('secret-2', token)).toBeNull();
  });

  // The puzzle token hides the matchId until a guess is scored — it must never be
  // usable as a session or start token, and neither of those may pass as a puzzle
  // token (the matchId gate would be bypassed).
  it('is isolated from the session and start token kinds', async () => {
    const puzzle = await signPuzzleToken('secret', 1800, 'm');
    expect(await verifySession('secret', puzzle)).toBeNull();
    expect(await verifyStartToken('secret', puzzle)).toBeNull();

    const { token: session } = await signSession('secret', 60);
    const { token: start } = await signStartToken('secret', 2700);
    expect(await verifyPuzzleToken('secret', session)).toBeNull();
    expect(await verifyPuzzleToken('secret', start)).toBeNull();
  });
});
