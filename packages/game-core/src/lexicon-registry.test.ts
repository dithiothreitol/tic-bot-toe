import { afterEach, describe, expect, it } from 'vitest';

import {
  clearLexicons,
  getLexicon,
  hasLexicon,
  miniLexicon,
  registerLexicon,
} from './lexicon-registry';

afterEach(() => clearLexicons());

describe('lexicon registry', () => {
  it('registers and reads a lexicon by language', () => {
    registerLexicon('en', miniLexicon('en', ['CAT', 'DOG']));
    expect(hasLexicon('en')).toBe(true);
    expect(getLexicon('en').has('cat')).toBe(true);
    expect(getLexicon('en').has('bird')).toBe(false);
  });

  it('throws a clear error when a language is not registered', () => {
    expect(hasLexicon('pl')).toBe(false);
    expect(() => getLexicon('pl')).toThrow(/No pl lexicon registered/);
  });

  it('miniLexicon normalizes NFC + case (Polish diacritics)', () => {
    const lex = miniLexicon('pl', ['ŁÓDŹ', 'gęś']);
    expect(lex.has('łódź')).toBe(true);
    expect(lex.has('GĘŚ')).toBe(true);
    expect(lex.wordCount).toBe(2);
  });

  it('re-registering replaces the previous lexicon', () => {
    registerLexicon('en', miniLexicon('en', ['CAT']));
    registerLexicon('en', miniLexicon('en', ['DOG']));
    expect(getLexicon('en').has('cat')).toBe(false);
    expect(getLexicon('en').has('dog')).toBe(true);
  });
});
