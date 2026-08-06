import { describe, expect, it } from 'vitest';

import { DAILY_OPPONENTS } from '@arena/game-core';

import { catalogDeadOpponents } from './openrouter-pool';

const POOL_OR_IDS = DAILY_OPPONENTS.filter((o) => o.provider === 'openrouter').map((o) => o.id);

/** A /models response listing exactly `ids` — shaped like the real endpoint. */
function catalogFetch(ids: string[], counter?: { calls: number }): typeof fetch {
  return (async () => {
    if (counter) counter.calls += 1;
    return {
      ok: true,
      json: async () => ({ data: ids.map((id) => ({ id })) }),
    } as Response;
  }) as typeof fetch;
}

describe('catalogDeadOpponents', () => {
  it('marks pool entries missing from the catalog as dead — and only those', async () => {
    const [gone, ...alive] = POOL_OR_IDS;
    const dead = await catalogDeadOpponents(catalogFetch([...alive, 'unrelated/model']))(
      '2026-08-06',
    );
    expect([...dead]).toEqual([gone]);
  });

  it('pins the first successful fetch for the whole day (mid-day catalog churn waits)', async () => {
    const counter = { calls: 0 };
    let ids = POOL_OR_IDS;
    const provider = catalogDeadOpponents(
      (async (...a) => catalogFetch(ids, counter)(...a)) as typeof fetch,
    );

    expect((await provider('2026-08-06')).size).toBe(0);
    ids = []; // everything "retires" mid-day…
    expect((await provider('2026-08-06')).size).toBe(0); // …but the pin holds
    expect(counter.calls).toBe(1);

    // A new day fetches fresh. (Empty catalog = broken response → empty set.)
    expect((await provider('2026-08-07')).size).toBe(0);
    expect(counter.calls).toBe(2);
  });

  it('treats an unreachable or broken catalog as "accuse nobody", without pinning', async () => {
    const counter = { calls: 0 };
    let fail = true;
    const provider = catalogDeadOpponents((async (...a) => {
      counter.calls += 1;
      if (fail) throw new Error('offline');
      return catalogFetch([])(...a); // empty catalog is also a broken response
    }) as typeof fetch);

    expect((await provider('2026-08-06')).size).toBe(0);
    fail = false;
    expect((await provider('2026-08-06')).size).toBe(0); // still retried — no pin on failure
    expect(counter.calls).toBe(2);
  });

  it('a non-OK status is a failure, not an empty pool massacre', async () => {
    const provider = catalogDeadOpponents((async () => ({ ok: false, status: 503 })) as never);
    expect((await provider('2026-08-06')).size).toBe(0);
  });
});
