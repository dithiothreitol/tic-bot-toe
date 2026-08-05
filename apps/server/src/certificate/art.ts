/**
 * Generated background art for the certificate and its share card.
 *
 * The files are produced by `scripts/gen/certificates.ts` (the same Gemini
 * pipeline as the rest of the app's imagery) and distributed here by
 * `scripts/gen/place-assets.ts`. They are JPEG, not WebP, for one hard reason:
 * `pdf-lib` embeds JPEG byte-for-byte (`DCTDecode`, no re-encode) and cannot
 * read WebP at all.
 *
 * Resolved next to the running module, exactly like the OG fonts:
 *   dev → src/certificate/assets · built → dist/certificate-assets
 * `CERT_ASSETS_DIR` overrides both.
 *
 * Missing art is NOT an error — the scene paints a flat brand background first,
 * so a certificate still renders (SPEC §20.7). Read once and cached: these are
 * megabyte-scale files on a request path.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ImageKey } from './scene-types';

/**
 * Two candidates, because the bundle flattens the source tree: in dev this
 * module sits in src/certificate/ and the art is in ./assets, but tsup emits a
 * single dist/index.js with the art beside it in ./certificate-assets. Getting
 * this wrong fails SILENTLY — the certificate still renders, just on a flat
 * background — so both layouts are checked rather than assumed.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  process.env.CERT_ASSETS_DIR,
  join(HERE, 'certificate-assets'), // bundled: dist/certificate-assets
  join(HERE, 'assets'), // source: src/certificate/assets
].filter((d): d is string => Boolean(d));

export const ART_DIR = CANDIDATES.find((d) => existsSync(d)) ?? CANDIDATES[CANDIDATES.length - 1]!;

const cache = new Map<ImageKey, Buffer | null>();

export function loadArt(key: ImageKey): Buffer | null {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let art: Buffer | null = null;
  for (const dir of CANDIDATES) {
    try {
      art = readFileSync(join(dir, `${key}.jpg`));
      break;
    } catch {
      // Try the next layout; a genuinely missing file falls through to null and
      // the scene paints its flat brand background instead (SPEC §20.7).
    }
  }
  cache.set(key, art);
  return art;
}

/** Test seam: drop the memoised art so a fixture directory can be swapped in. */
export function clearArtCache(): void {
  cache.clear();
}
