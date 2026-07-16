/**
 * Lexicon registry (plan §6.3).
 *
 * A `Lexicon` is a compiled dictionary (a DAWG) — NOT serializable, so it can't
 * ride through `SetupConfig`/`SetupRecord`. The scrabble engine needs it to
 * validate words, but game-core must stay pure (no fs, no fetch). So the actual
 * dictionaries live in `@arena/lexicons`; each environment (browser, server,
 * tests) loads and REGISTERS them here, and the engine reads them back by
 * language. game-core never imports the lexicons package — the interface below
 * is structural, so any object with `has`/`language`/`wordCount` fits.
 */

export type LexiconLanguage = 'pl' | 'en';

export interface Lexicon {
  language: LexiconLanguage;
  /** Membership test, O(word length), after NFC + uppercase normalization. */
  has(word: string): boolean;
  wordCount: number;
}

const registry = new Map<LexiconLanguage, Lexicon>();

/** Register (or replace) the dictionary for a language. Called at boot / before a scrabble match. */
export function registerLexicon(language: LexiconLanguage, lexicon: Lexicon): void {
  registry.set(language, lexicon);
}

/** Read a registered dictionary, or throw a clear error naming what to load. */
export function getLexicon(language: LexiconLanguage): Lexicon {
  const lex = registry.get(language);
  if (!lex) {
    throw new Error(
      `No ${language} lexicon registered. Load it via @arena/lexicons and call registerLexicon('${language}', …) before playing/validating scrabble.`,
    );
  }
  return lex;
}

/** Whether a language's dictionary is available (server 503 gate, UI load screen). */
export function hasLexicon(language: LexiconLanguage): boolean {
  return registry.has(language);
}

/** Drop a registration (tests). */
export function clearLexicons(): void {
  registry.clear();
}

/**
 * A tiny in-memory lexicon from an explicit word list — for tests, so game-core
 * suites never read files (plan §6.3). Normalizes to NFC + uppercase, matching
 * the real DAWG lookup.
 */
export function miniLexicon(language: LexiconLanguage, words: string[]): Lexicon {
  const set = new Set(words.map((w) => w.normalize('NFC').toUpperCase()));
  return {
    language,
    has: (word: string) => set.has(word.normalize('NFC').toUpperCase()),
    wordCount: set.size,
  };
}
