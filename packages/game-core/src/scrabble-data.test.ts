import { describe, expect, it } from 'vitest';

import { EN_TILES, PL_TILES, PREMIUMS, letterValues, premiumAt } from './scrabble-data';

function totalTiles(tiles: { count: number }[]): number {
  return tiles.reduce((a, t) => a + t.count, 0);
}

describe('scrabble tile sets', () => {
  it('each language has exactly 100 tiles with 2 blanks', () => {
    expect(totalTiles(EN_TILES)).toBe(100);
    expect(totalTiles(PL_TILES)).toBe(100);
    expect(EN_TILES.find((t) => t.letter === '?')!.count).toBe(2);
    expect(PL_TILES.find((t) => t.letter === '?')!.count).toBe(2);
  });

  it('uses the official English point values', () => {
    const v = letterValues('en');
    expect(v.get('A')).toBe(1);
    expect(v.get('D')).toBe(2);
    expect(v.get('B')).toBe(3);
    expect(v.get('F')).toBe(4);
    expect(v.get('K')).toBe(5);
    expect(v.get('J')).toBe(8);
    expect(v.get('X')).toBe(8);
    expect(v.get('Q')).toBe(10);
    expect(v.get('Z')).toBe(10);
    expect(v.get('?')).toBe(0);
  });

  it('uses the official Polish point values and letters (no Q/V/X)', () => {
    const v = letterValues('pl');
    expect(v.get('A')).toBe(1);
    expect(v.get('Y')).toBe(2);
    expect(v.get('C')).toBe(2);
    expect(v.get('U')).toBe(3);
    expect(v.get('Ą')).toBe(5);
    expect(v.get('Ć')).toBe(6);
    expect(v.get('Ń')).toBe(7);
    expect(v.get('Ź')).toBe(9);
    expect(v.has('Q')).toBe(false);
    expect(v.has('V')).toBe(false);
    expect(v.has('X')).toBe(false);
  });

  it('lays out the standard 225-square premium board (symmetric, centre = DW)', () => {
    expect(PREMIUMS).toHaveLength(225);
    // Corners are triple-word.
    for (const cell of [0, 14, 14 * 15, 14 * 15 + 14]) expect(premiumAt(cell)).toBe('tw');
    // Centre H8 is the star.
    expect(premiumAt(7 * 15 + 7)).toBe('center');
    // Count matches the classic board: 8 TW, 17 DW (incl. centre), 12 TL, 24 DL.
    const counts = PREMIUMS.reduce<Record<string, number>>((a, p) => {
      a[p] = (a[p] ?? 0) + 1;
      return a;
    }, {});
    expect(counts.tw).toBe(8);
    expect((counts.dw ?? 0) + (counts.center ?? 0)).toBe(17);
    expect(counts.tl).toBe(12);
    expect(counts.dl).toBe(24);
  });
});
