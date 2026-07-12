import { describe, expect, it } from 'vitest';

import { hashPlayerToken, isValidPlayerToken } from './player';

describe('player token', () => {
  it('hashes deterministically to 64 hex chars and hides the token', () => {
    const a = hashPlayerToken('abc123def456ghi789jkl');
    const b = hashPlayerToken('abc123def456ghi789jkl');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('abc123');
  });

  it('accepts a legacy UUID token and a base64url secret', () => {
    expect(isValidPlayerToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidPlayerToken('dGhpcy1pcy1hLTMyLWJ5dGUtc2VjcmV0LXRva2VuXy0')).toBe(true);
  });

  it('rejects too-short, too-long, and unsafe characters', () => {
    expect(isValidPlayerToken('short')).toBe(false);
    expect(isValidPlayerToken('a'.repeat(65))).toBe(false);
    expect(isValidPlayerToken('has space and !@#')).toBe(false);
    expect(isValidPlayerToken('')).toBe(false);
  });
});
