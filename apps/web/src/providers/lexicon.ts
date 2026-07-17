/**
 * Lazy dictionary loading for the word game. Fetches the compiled DAWG for a
 * language, registers it in the game-core registry (so the scrabble engine can
 * validate words), and de-dupes concurrent/repeat loads. Only the word game
 * pulls a dictionary, and only once per language per session.
 */
import { type LexiconLoadProgress, loadLexiconBrowser } from '@arena/lexicons';
import { hasLexicon, registerLexicon } from '@arena/game-core';

export type LexiconLanguage = 'pl' | 'en';

const inFlight = new Map<LexiconLanguage, Promise<void>>();

export function isLexiconReady(language: LexiconLanguage): boolean {
  return hasLexicon(language);
}

/** Ensure the language's dictionary is loaded + registered. Safe to call repeatedly. */
export function ensureLexicon(
  language: LexiconLanguage,
  onProgress?: (p: LexiconLoadProgress) => void,
): Promise<void> {
  if (hasLexicon(language)) return Promise.resolve();
  const existing = inFlight.get(language);
  if (existing) return existing;
  const p = loadLexiconBrowser(language, { onProgress })
    .then((lex) => {
      registerLexicon(language, lex);
    })
    .catch((e) => {
      inFlight.delete(language); // allow a retry after a failure
      throw e;
    });
  inFlight.set(language, p);
  return p;
}
