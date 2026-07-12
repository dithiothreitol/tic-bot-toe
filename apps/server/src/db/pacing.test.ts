import { describe, expect, it } from 'vitest';

import { requiredElapsedMs, suspiciousHumanTiming } from './results';

/** §15.3 — 1s per human move, 2s tolerance, capped at 15 min. */
describe('requiredElapsedMs', () => {
  it('demands roughly one second per human move, minus tolerance', () => {
    expect(requiredElapsedMs(10)).toBe(8_000); // 10s - 2s
    expect(requiredElapsedMs(30)).toBe(28_000);
  });

  it('never demands time for very short games (tolerance absorbs them)', () => {
    expect(requiredElapsedMs(0)).toBe(0);
    expect(requiredElapsedMs(2)).toBe(0); // 2s - 2s
  });

  it('caps at 15 minutes so long battleship games are not punished', () => {
    expect(requiredElapsedMs(10_000)).toBe(15 * 60_000 - 2_000);
  });
});

describe('suspiciousHumanTiming', () => {
  it('accepts believable, varied human move times', () => {
    expect(suspiciousHumanTiming([1200, 3400, 800, 2500, 5000])).toBe(false);
  });

  it('flags an average under 800ms (nobody plays that fast)', () => {
    expect(suspiciousHumanTiming([100, 200, 150])).toBe(true);
  });

  it('flags metronomic timing — identical move times mean a script', () => {
    expect(suspiciousHumanTiming([2000, 2000, 2000, 2000, 2000])).toBe(true);
  });

  it('stays quiet on too few moves to judge', () => {
    expect(suspiciousHumanTiming([100, 100])).toBe(false);
    expect(suspiciousHumanTiming([])).toBe(false);
  });
});
