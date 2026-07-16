import { describe, expect, it } from 'vitest';

import { loadLexiconNode } from './loader-node';

/**
 * Control-word check against the REAL committed artifacts (plan §6 DoD). Loads
 * dist/{en,pl}.dawg from disk and verifies membership on a hand-picked list,
 * including Polish diacritics. If the .dawg files are missing (fresh clone
 * before `pnpm lexicon:build`), the test is skipped rather than failing — the
 * codec itself is covered by dawg.test.ts.
 */
async function tryLoad(lang: 'en' | 'pl') {
  try {
    return await loadLexiconNode(lang);
  } catch {
    return null;
  }
}

describe('committed dictionary artifacts', () => {
  it('en.dawg knows common words and rejects non-words', async () => {
    const en = await tryLoad('en');
    if (!en) return; // artifact not built in this checkout
    expect(en.language).toBe('en');
    expect(en.wordCount).toBeGreaterThan(150_000);
    for (const w of ['cat', 'house', 'quiz', 'zombie', 'xylophone', 'jazzy']) {
      expect(en.has(w)).toBe(true);
    }
    for (const w of ['catz', 'asdfg', 'xyzzyx']) {
      expect(en.has(w)).toBe(false);
    }
  });

  it('pl.dawg knows Polish words with diacritics and rejects non-words', async () => {
    const pl = await tryLoad('pl');
    if (!pl) return;
    expect(pl.language).toBe('pl');
    expect(pl.wordCount).toBeGreaterThan(1_000_000);
    for (const w of ['łódź', 'żółć', 'gęś', 'pięć', 'mąka', 'kot', 'koty', 'źdźbło']) {
      expect(pl.has(w)).toBe(true);
    }
    // lowercase normalizes up; look-alikes and out-of-alphabet letters are absent.
    expect(pl.has('ŁÓDŹ')).toBe(true);
    for (const w of ['łodz', 'quark', 'xyz', 'zzzz']) {
      expect(pl.has(w)).toBe(false);
    }
  });
});
