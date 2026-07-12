import { describe, expect, it } from 'vitest';

import { normalizeNickname, validateNickname } from './nickname';

describe('validateNickname', () => {
  it('accepts a valid nickname and lowercases it', () => {
    const r = validateNickname('  KrzyżykowyMistrz  ');
    expect(r).toEqual({ ok: true, value: 'krzyżykowymistrz' });
  });

  it('accepts Polish letters, digits, underscore and dash', () => {
    expect(validateNickname('gęś_łoś-7').ok).toBe(true);
  });

  it('rejects too short and too long', () => {
    expect(validateNickname('ab')).toEqual({ ok: false, error: 'invalid_format' });
    expect(validateNickname('a'.repeat(21))).toEqual({ ok: false, error: 'invalid_format' });
  });

  it('rejects illegal characters (spaces, punctuation)', () => {
    expect(validateNickname('ala ma kota')).toEqual({ ok: false, error: 'invalid_format' });
    expect(validateNickname('hej!')).toEqual({ ok: false, error: 'invalid_format' });
  });

  it('rejects profanity, including with Polish diacritics', () => {
    expect(validateNickname('kurwa123')).toEqual({ ok: false, error: 'profanity' });
    expect(validateNickname('xChujeqx')).toEqual({ ok: false, error: 'profanity' });
  });

  it('normalizeNickname trims and lowercases', () => {
    expect(normalizeNickname('  AbC ')).toBe('abc');
  });
});
