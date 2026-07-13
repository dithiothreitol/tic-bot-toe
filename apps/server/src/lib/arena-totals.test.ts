import { describe, expect, it } from 'vitest';

import { FinishDedup, MAX_FINISH_TOKENS, clampFinishTokens } from './arena-totals';

describe('clampFinishTokens', () => {
  it('keeps a sane positive integer', () => {
    expect(clampFinishTokens(1234)).toBe(1234);
    expect(clampFinishTokens(1234.9)).toBe(1234); // floored
  });

  it('treats missing / negative / non-numeric as zero', () => {
    expect(clampFinishTokens(0)).toBe(0);
    expect(clampFinishTokens(-5)).toBe(0);
    expect(clampFinishTokens(undefined)).toBe(0);
    expect(clampFinishTokens('9000')).toBe(0);
    expect(clampFinishTokens(Number.NaN)).toBe(0);
    expect(clampFinishTokens(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('caps an implausibly large report', () => {
    expect(clampFinishTokens(MAX_FINISH_TOKENS + 1)).toBe(MAX_FINISH_TOKENS);
    expect(clampFinishTokens(1e12)).toBe(MAX_FINISH_TOKENS);
  });
});

describe('FinishDedup', () => {
  it('counts an id the first time and refuses repeats', () => {
    const d = new FinishDedup();
    expect(d.add('m1')).toBe(true);
    expect(d.add('m1')).toBe(false);
    expect(d.add('m2')).toBe(true);
  });

  it('stays bounded, forgetting the oldest window once full', () => {
    const d = new FinishDedup(2);
    expect(d.add('a')).toBe(true);
    expect(d.add('b')).toBe(true);
    // Third distinct id trips the bound → window cleared, so 'a' is countable again.
    expect(d.add('c')).toBe(true);
    expect(d.add('a')).toBe(true);
  });
});
