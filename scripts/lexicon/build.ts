/**
 * Build the binary DAWG dictionaries committed to the repo (plan §6.1).
 *
 *   pnpm lexicon:build
 *
 * Reads plain-text word lists from `scripts/lexicon/sources/`, filters them to
 * the tile alphabet of each language (length 2–15, letters only — this drops
 * e.g. Polish words with q/v/x), NFC + uppercases, then emits a minimal DAWG to
 * `packages/lexicons/dist/<lang>.dawg`. Deterministic: same input → same bytes.
 *
 * Sources (obtain once, place in scripts/lexicon/sources/):
 *   - en → `enable1.txt`  — ENABLE1 word list, PUBLIC DOMAIN (Alan Beale / M. Cooper).
 *   - pl → `slowa.txt`    — sjp.pl game dictionary (unzip sjp-YYYYMMDD.zip),
 *                            dual-licensed GPL 2 + CC BY 4.0 (attribution required).
 * License texts live in `packages/lexicons/LICENSES/`.
 *
 * The raw sources are NOT committed (large, and the DAWG is the artifact); only
 * the compiled `.dawg` files and the licenses are.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  encodeLexicon,
  normalizeWord,
  type LexiconLanguage,
} from '../../packages/lexicons/src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(HERE, 'sources');
const DIST = join(HERE, '..', '..', 'packages', 'lexicons', 'dist');

/** Scrabble tile alphabets — words using any other letter are dropped. */
const ALPHABETS: Record<LexiconLanguage, string> = {
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  // 32 Polish tiles: no Q, V, X.
  pl: 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPRSŚTUWYZŹŻ',
};

const MIN_LEN = 2;
const MAX_LEN = 15;

interface Source {
  language: LexiconLanguage;
  file: string;
}

const SRC: Source[] = [
  { language: 'en', file: 'enable1.txt' },
  { language: 'pl', file: 'slowa.txt' },
];

function filterWords(raw: string, alphabet: string): string[] {
  const allowed = new Set(Array.from(alphabet));
  const out = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const w = normalizeWord(line.trim());
    if (w.length < MIN_LEN || w.length > MAX_LEN) continue;
    let ok = true;
    for (const ch of w) {
      if (!allowed.has(ch)) {
        ok = false;
        break;
      }
    }
    if (ok) out.add(w);
  }
  return [...out].sort();
}

async function build(): Promise<void> {
  await mkdir(DIST, { recursive: true });
  let built = 0;
  for (const { language, file } of SRC) {
    const path = join(SOURCES, file);
    if (!existsSync(path)) {
      console.warn(
        `⚠ skip ${language}: missing ${path}\n  → obtain the source and place it there (see this file's header).`,
      );
      continue;
    }
    const raw = await readFile(path, 'utf8');
    const words = filterWords(raw, ALPHABETS[language]);
    if (words.length === 0) throw new Error(`${language}: no words survived filtering — wrong source file?`);
    const bytes = encodeLexicon(language, words);
    const outPath = join(DIST, `${language}.dawg`);
    await writeFile(outPath, bytes);
    const mb = (bytes.length / 1_048_576).toFixed(2);
    console.log(`✓ ${language}: ${words.length.toLocaleString()} words → ${outPath} (${mb} MB)`);
    built += 1;
  }
  if (built === 0) {
    console.error('No lexicons built. Place source files in scripts/lexicon/sources/ and re-run.');
    process.exit(1);
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
