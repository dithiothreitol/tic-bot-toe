import { describe, expect, it } from 'vitest';

import { ELO_K, ELO_START, expectedScore, scoreForP1, updateElo } from './elo';

describe('elo', () => {
  it('expected score is 0.5 for equal ratings and skews with the gap', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5);
    expect(expectedScore(1000, 1200)).toBeLessThan(0.5);
  });

  it('is zero-sum: the winner gains exactly what the loser loses', () => {
    const { a, b } = updateElo(1000, 1000, 'p1');
    expect(a - 1000).toBeCloseTo(1000 - b);
    expect(a).toBeGreaterThan(1000);
    expect(b).toBeLessThan(1000);
  });

  it('a win between equals moves by K/2 (16)', () => {
    expect(updateElo(1000, 1000, 'p1').a - 1000).toBeCloseTo(ELO_K / 2);
  });

  it('a draw between equals leaves ratings unchanged', () => {
    const { a, b } = updateElo(1000, 1000, 'draw');
    expect(a).toBeCloseTo(1000);
    expect(b).toBeCloseTo(1000);
  });

  it('gives the points to whoever won', () => {
    const p2win = updateElo(1000, 1000, 'p2');
    expect(p2win.b).toBeGreaterThan(1000);
    expect(p2win.a).toBeLessThan(1000);
  });

  it('scoreForP1 and constants', () => {
    expect(scoreForP1('p1')).toBe(1);
    expect(scoreForP1('p2')).toBe(0);
    expect(scoreForP1('draw')).toBe(0.5);
    expect(ELO_START).toBe(1000);
  });
});
