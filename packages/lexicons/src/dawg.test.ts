import { describe, expect, it } from 'vitest';

import { decodeLexicon, encodeLexicon, lexiconFromWords, normalizeWord } from './dawg';

/** Encode + decode a word list into a queryable lexicon. */
function roundTrip(language: 'pl' | 'en', words: string[]) {
  const sorted = [...new Set(words.map(normalizeWord))].sort();
  return decodeLexicon(encodeLexicon(language, sorted));
}

describe('DAWG codec', () => {
  it('answers membership for the exact words it was built from', () => {
    const lex = roundTrip('en', ['CAT', 'CAR', 'CARE', 'CARS', 'CATS', 'DOG']);
    for (const w of ['CAT', 'CAR', 'CARE', 'CARS', 'CATS', 'DOG']) {
      expect(lex.has(w)).toBe(true);
    }
  });

  it('rejects words that are not present (including prefixes and extensions)', () => {
    const lex = roundTrip('en', ['CAT', 'CARE', 'CATS']);
    expect(lex.has('CA')).toBe(false); // proper prefix, not a stored word
    expect(lex.has('CATSS')).toBe(false); // extension past a leaf
    expect(lex.has('CARED')).toBe(false);
    expect(lex.has('DOG')).toBe(false);
    expect(lex.has('')).toBe(false);
  });

  it('normalizes case and Unicode form on lookup', () => {
    const lex = roundTrip('en', ['CARE']);
    expect(lex.has('care')).toBe(true);
    expect(lex.has('Care')).toBe(true);
  });

  it('handles the Polish alphabet, including diacritics', () => {
    // Real Polish game words with ą/ć/ę/ł/ń/ó/ś/ź/ż.
    const words = ['ŁÓDŹ', 'ŻÓŁĆ', 'GĘŚ', 'ZAŻÓŁĆ', 'STÓŁ', 'PIĘĆ', 'MĄKA'];
    const lex = roundTrip('pl', words);
    expect(lex.has('łódź')).toBe(true); // lowercase input normalizes up
    expect(lex.has('ŻÓŁĆ')).toBe(true);
    expect(lex.has('GĘŚ')).toBe(true);
    expect(lex.has('PIĘĆ')).toBe(true);
    expect(lex.has('MĄKA')).toBe(true);
    // A word using a letter outside the built alphabet is simply absent.
    expect(lex.has('QUARK')).toBe(false);
    // Latin look-alikes are NOT the Polish letters.
    expect(lex.has('LODZ')).toBe(false);
  });

  it('reports the word count and language from the header', () => {
    const lex = roundTrip('pl', ['MĄKA', 'GĘŚ', 'GĘŚ', 'gęś']); // dupes collapse
    expect(lex.language).toBe('pl');
    expect(lex.wordCount).toBe(2);
  });

  it('deduplicates equivalent suffixes (the DAWG is smaller than the trie)', () => {
    // CARS/CATS/EARS/EATS share the "S" leaf and more — the encoding must still
    // answer correctly after that merging.
    const lex = roundTrip('en', ['CARS', 'CATS', 'EARS', 'EATS', 'CAR', 'CAT', 'EAR', 'EAT']);
    for (const w of ['CARS', 'CATS', 'EARS', 'EATS', 'CAR', 'CAT', 'EAR', 'EAT']) {
      expect(lex.has(w)).toBe(true);
    }
    expect(lex.has('EATSS')).toBe(false);
    expect(lex.has('CA')).toBe(false);
  });

  it('round-trips a larger synthetic list exactly (membership matches the source set)', () => {
    // Generate deterministic pseudo-words and check the lexicon equals the set.
    const words = new Set<string>();
    const A = 'ABCDEFGH';
    for (let i = 0; i < 2000; i++) {
      let n = i;
      let w = '';
      const len = 2 + (i % 6);
      for (let k = 0; k < len; k++) {
        w += A[n % A.length];
        n = Math.floor(n / A.length) + 7 * k + 1;
      }
      words.add(w);
    }
    const list = [...words];
    const lex = lexiconFromWords('en', list);
    for (const w of list) expect(lex.has(w)).toBe(true);
    // A handful of strings NOT in the set must be rejected.
    expect(lex.has('ZZZZ')).toBe(false);
    expect(lex.has(list[0] + 'Q')).toBe(false);
  });

  it('an empty lexicon has nothing', () => {
    const lex = roundTrip('en', []);
    expect(lex.has('ANYTHING')).toBe(false);
    expect(lex.wordCount).toBe(0);
  });
});

describe('lexiconFromWords', () => {
  it('accepts raw (unsorted, mixed-case, duplicate) input', () => {
    const lex = lexiconFromWords('en', ['dog', 'CAT', 'Dog', 'cat', 'bird']);
    expect(lex.wordCount).toBe(3);
    expect(lex.has('DOG')).toBe(true);
    expect(lex.has('bird')).toBe(true);
  });
});
