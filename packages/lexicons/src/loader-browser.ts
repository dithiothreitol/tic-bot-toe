/**
 * Browser loader: fetch the compiled DAWG, cache it (Cache API), report progress
 * for a load bar, and decode it. Lazy — only scrabble pulls a dictionary, and
 * only once per language (the cache survives reloads).
 */
import { type Lexicon, type LexiconLanguage, decodeLexicon } from './dawg';

export interface LexiconLoadProgress {
  /** Bytes downloaded so far. */
  loaded: number;
  /** Total bytes if the server sent Content-Length, else null. */
  total: number | null;
}

export interface LoadLexiconOptions {
  /** Where the `.dawg` files are served (default `/lexicons`). */
  baseUrl?: string;
  onProgress?: (p: LexiconLoadProgress) => void;
  signal?: AbortSignal;
}

const CACHE_NAME = 'arena-lexicons-v1';

// The Cache API is browser-only and this package is typed against @types/node
// (which has `fetch`/`Response` but not `caches`). Reach it structurally so the
// codec stays environment-neutral; it's simply skipped where absent.
interface MinimalCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
}
interface MinimalCacheStorage {
  open(name: string): Promise<MinimalCache>;
}
function cacheStorage(): MinimalCacheStorage | null {
  return (globalThis as { caches?: MinimalCacheStorage }).caches ?? null;
}

export async function loadLexiconBrowser(
  language: LexiconLanguage,
  opts: LoadLexiconOptions = {},
): Promise<Lexicon> {
  const url = `${opts.baseUrl ?? '/lexicons'}/${language}.dawg`;

  // Serve from the Cache API when present — a dictionary is big and immutable.
  const storage = cacheStorage();
  const cache = storage ? await storage.open(CACHE_NAME) : null;
  const cached = cache ? await cache.match(url) : undefined;
  const response = cached ?? (await fetch(url, { signal: opts.signal }));
  if (!response.ok) {
    throw new Error(`Failed to load ${language} lexicon: HTTP ${response.status}`);
  }
  if (!cached && cache) {
    // Store a clone for next time (best-effort — a private-mode failure is fine).
    void cache.put(url, response.clone()).catch(() => {});
  }

  const total = Number(response.headers.get('content-length')) || null;
  const bytes = await readWithProgress(response, total, opts.onProgress);
  return decodeLexicon(bytes);
}

/** Read the body, emitting progress if a stream reader is available. */
async function readWithProgress(
  response: Response,
  total: number | null,
  onProgress?: (p: LexiconLoadProgress) => void,
): Promise<Uint8Array> {
  if (!response.body || !onProgress) {
    return new Uint8Array(await response.arrayBuffer());
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ loaded, total });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
