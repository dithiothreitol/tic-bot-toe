/**
 * Node loader: read the compiled DAWG from disk at server boot. Kept in its own
 * entry (`@arena/lexicons/node`) so the browser bundle never pulls in `node:fs`.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { type Lexicon, type LexiconLanguage, decodeLexicon } from './dawg';

/**
 * Directory holding `pl.dawg` / `en.dawg`. Override with `LEXICON_DIR` (the
 * Docker image copies the artifacts to a fixed path — plan §8.2); the default is
 * this package's `dist/`, which the build script emits into.
 */
export function defaultLexiconDir(): string {
  if (process.env.LEXICON_DIR) return process.env.LEXICON_DIR;
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
}

export async function loadLexiconNode(
  language: LexiconLanguage,
  dir: string = defaultLexiconDir(),
): Promise<Lexicon> {
  const path = join(dir, `${language}.dawg`);
  const bytes = await readFile(path);
  return decodeLexicon(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}
