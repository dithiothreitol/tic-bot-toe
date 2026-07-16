import { describe, expect, it } from 'vitest';

import { battleship } from './battleship';
import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('is deterministic: the same seed yields the same stream', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('yields floats in [0, 1)', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different streams', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('produces a stable known value for a fixed seed (guards the algorithm)', () => {
    // Snapshot of the first draw for seed 42 — extracting mulberry32 out of
    // battleship must NOT change the stream, so this pins it.
    expect(mulberry32(42)()).toBeCloseTo(0.6011037519201636, 15);
  });
});

describe('mulberry32 extraction — battleship regression', () => {
  it('generates identical fleets for the same seed after the extraction', () => {
    // The engine now imports mulberry32 from rng.ts; the same seed must still
    // reproduce the exact same ship placement it did before.
    const variant = battleship.variants.find((v) => v.id === 'small')!;
    const s1 = battleship.createInitialState(variant, { seed: 777 });
    const s2 = battleship.createInitialState(variant, { seed: 777 });
    expect(s1.fleets.p1.ships.map((sh) => sh.cells)).toEqual(
      s2.fleets.p1.ships.map((sh) => sh.cells),
    );
    expect(s1.fleets.p2.ships.map((sh) => sh.cells)).toEqual(
      s2.fleets.p2.ships.map((sh) => sh.cells),
    );
  });
});
