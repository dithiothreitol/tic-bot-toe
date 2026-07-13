import { describe, expect, it } from 'vitest';

import { LIVE_TTL_MS, LiveRegistry } from './live';

describe('LiveRegistry', () => {
  it('counts by mode and totals them', () => {
    const reg = new LiveRegistry();
    reg.ping('a', 'model_vs_model', 0);
    reg.ping('b', 'model_vs_model', 0);
    reg.ping('c', 'human_vs_model', 0);
    expect(reg.counts(0)).toEqual({
      model_vs_model: 2,
      human_vs_model: 1,
      total: 3,
    });
  });

  it('treats a repeat ping as the same match (no double count) and refreshes its expiry', () => {
    const reg = new LiveRegistry(1000);
    reg.ping('a', 'model_vs_model', 0);
    reg.ping('a', 'model_vs_model', 900); // still the one match, now good until 1900
    expect(reg.counts(900)).toEqual({ model_vs_model: 1, human_vs_model: 0, total: 1 });
    expect(reg.counts(1500).total).toBe(1); // would have expired at 1000 without the refresh
  });

  it('drops entries once their TTL lapses', () => {
    const reg = new LiveRegistry(1000);
    reg.ping('a', 'human_vs_model', 0);
    expect(reg.counts(999).total).toBe(1);
    expect(reg.counts(1000).total).toBe(0); // expiry is inclusive
  });

  it('drops an entry immediately on drop()', () => {
    const reg = new LiveRegistry();
    reg.ping('a', 'model_vs_model', 0);
    reg.drop('a');
    expect(reg.counts(0).total).toBe(0);
  });

  it('lets a mode change on the same id', () => {
    const reg = new LiveRegistry();
    reg.ping('a', 'model_vs_model', 0);
    reg.ping('a', 'human_vs_model', 0);
    expect(reg.counts(0)).toEqual({ model_vs_model: 0, human_vs_model: 1, total: 1 });
  });

  it('exposes a sane default TTL', () => {
    expect(LIVE_TTL_MS).toBeGreaterThanOrEqual(30_000);
  });
});
