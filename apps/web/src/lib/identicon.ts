/**
 * Deterministic identicon pattern from a subject id (SPEC §4 — "awatar
 * generowany deterministycznie z id").
 *
 * Pattern ONLY. The color comes from the player's role (P1 cyan / P2 magenta),
 * because DESIGN §5 binds colors to roles — an avatar tinted from the hash would
 * break that rule (a model would be magenta in the table and cyan in a match).
 */
const SIZE = 5;
/** Seeded columns; the rest is mirrored, so the mark reads as one glyph. */
const HALF = Math.ceil(SIZE / 2);

/** FNV-1a — small, stable, dependency-free. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 5×5 vertically symmetric grid of filled cells, row-major. */
export function identiconCells(seed: string): boolean[] {
  let h = hashSeed(seed);
  const cells = new Array<boolean>(SIZE * SIZE).fill(false);

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < HALF; col++) {
      // Re-mix per cell, otherwise neighbouring cells correlate visibly.
      h = Math.imul(h ^ (row * SIZE + col), 0x01000193) >>> 0;
      const on = (h & 0x80) !== 0;
      cells[row * SIZE + col] = on;
      cells[row * SIZE + (SIZE - 1 - col)] = on;
    }
  }

  // A blank mark would read as a rendering bug — fall back to a centre bar.
  if (!cells.some(Boolean)) {
    for (let row = 0; row < SIZE; row++) cells[row * SIZE + 2] = true;
  }
  return cells;
}

export const IDENTICON_SIZE = SIZE;
