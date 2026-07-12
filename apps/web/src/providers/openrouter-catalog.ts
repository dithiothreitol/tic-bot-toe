import type { TokenPrice } from './llm-runner';
import { OPENROUTER_BASE } from './openrouter';

/**
 * OpenRouter model catalog (SPEC §2.1): fetched from the public /models
 * endpoint (no key required), cached 1h. Prices feed telemetry cost (§9); the
 * ":free" filter drives the "only free" toggle in the picker.
 */
export interface CatalogModel {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per token. */
  pricePromptPerToken: number;
  priceCompletionPerToken: number;
  isFree: boolean;
}

interface RawModel {
  id: string;
  name?: string;
  context_length?: number | null;
  pricing?: { prompt?: string | number; completion?: string | number };
}

function toNumber(value: string | number | undefined): number {
  const n = typeof value === 'number' ? value : Number(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

export function parseCatalog(raw: unknown): CatalogModel[] {
  const list: RawModel[] = Array.isArray(raw)
    ? (raw as RawModel[])
    : ((raw as { data?: RawModel[] } | null)?.data ?? []);

  return list
    .filter((m): m is RawModel => Boolean(m && typeof m.id === 'string'))
    .map((m) => {
      const prompt = toNumber(m.pricing?.prompt);
      const completion = toNumber(m.pricing?.completion);
      return {
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? null,
        pricePromptPerToken: prompt,
        priceCompletionPerToken: completion,
        // Free ⇔ zero prompt AND completion price (covers ":free" variants).
        isFree: prompt === 0 && completion === 0,
      };
    });
}

export function priceForModel(
  models: CatalogModel[],
  id: string,
): TokenPrice | undefined {
  const m = models.find((x) => x.id === id);
  if (!m) return undefined;
  return { prompt: m.pricePromptPerToken, completion: m.priceCompletionPerToken };
}

const CACHE_KEY = 'openrouter-catalog';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h (SPEC §2.1)

interface CacheEnvelope {
  fetchedAt: number;
  models: CatalogModel[];
}

function readCache(nowMs: number): CatalogModel[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (nowMs - env.fetchedAt > CACHE_TTL_MS) return null;
    return env.models;
  } catch {
    return null;
  }
}

function writeCache(models: CatalogModel[], nowMs: number): void {
  try {
    const env: CacheEnvelope = { fetchedAt: nowMs, models };
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(env));
  } catch {
    // storage full / unavailable — cache is best-effort.
  }
}

export interface FetchCatalogOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  force?: boolean;
}

export async function fetchCatalog(
  opts: FetchCatalogOptions = {},
): Promise<CatalogModel[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;

  if (!opts.force) {
    const cached = readCache(now());
    if (cached) return cached;
  }

  const res = await doFetch(`${OPENROUTER_BASE}/models`);
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
  const models = parseCatalog(await res.json());
  writeCache(models, now());
  return models;
}
