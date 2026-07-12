import { describe, expect, it } from 'vitest';

import { isValidPlayerToken, randomSecret } from './id';

describe('player identity token', () => {
  it('generates a 43-char base64url secret the API accepts', () => {
    const a = randomSecret();
    expect(a).toHaveLength(43);
    expect(isValidPlayerToken(a)).toBe(true);
  });

  it('generates a different secret each time', () => {
    expect(randomSecret()).not.toBe(randomSecret());
  });

  it('rejects malformed identity codes (import guard)', () => {
    expect(isValidPlayerToken('too-short')).toBe(false);
    expect(isValidPlayerToken('has spaces in it and is long')).toBe(false);
    expect(isValidPlayerToken('')).toBe(false);
    expect(isValidPlayerToken('a'.repeat(65))).toBe(false);
  });

  it('accepts a legacy UUID identity (already in some browsers)', () => {
    expect(isValidPlayerToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });
});
