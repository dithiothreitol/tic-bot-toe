import { describe, expect, it } from 'vitest';

import { type CacheEntry, MAX_CACHE_ENTRIES, pruneCache } from './psychology';

/**
 * The psychology cache is keyed by `subjectId`, which comes straight from the
 * query string — an unbounded, attacker-controlled keyspace. `pruneCache` is what
 * keeps it from growing without limit (review finding #1).
 */

const entry = (at: number): CacheEntry => ({ at, data: {} as CacheEntry['data'] });

describe('pruneCache', () => {
  it('drops entries older than the TTL', () => {
    const now = 100 * 60_000;
    const cache = new Map<string, CacheEntry>([
      ['fresh', entry(now)],
      ['stale', entry(0)], // ~100 min old → well past the 10-min TTL
    ]);
    pruneCache(cache, now);
    expect(cache.has('fresh')).toBe(true);
    expect(cache.has('stale')).toBe(false);
  });

  it('evicts oldest-first once the cap is hit, so the map stays bounded', () => {
    const now = 1_000;
    const cache = new Map<string, CacheEntry>();
    // Fill just past the cap with fresh (non-expiring) entries in insertion order.
    for (let i = 0; i < MAX_CACHE_ENTRIES + 5; i++) cache.set(`k${i}`, entry(now));

    pruneCache(cache, now);

    // Bounded below the cap, and the earliest-inserted keys are the ones gone.
    expect(cache.size).toBeLessThan(MAX_CACHE_ENTRIES);
    expect(cache.has('k0')).toBe(false);
    expect(cache.has(`k${MAX_CACHE_ENTRIES + 4}`)).toBe(true); // newest survives
  });

  it('is a no-op when under cap and nothing is expired', () => {
    const now = 5_000;
    const cache = new Map<string, CacheEntry>([['a', entry(now)], ['b', entry(now)]]);
    pruneCache(cache, now);
    expect(cache.size).toBe(2);
  });
});
