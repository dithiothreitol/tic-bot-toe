/**
 * Deterministic PRNG shared by every engine that needs seeded randomness
 * (battleship fleet placement, sudoku puzzle generation, scrabble bag shuffle).
 *
 * Kept in one place so the SAME sequence is produced in the browser (playing)
 * and on the server (replay validation, SPEC §15). Pure TS — no DOM, no Node.
 */

/**
 * mulberry32: a tiny, fast 32-bit PRNG. Same seed → same stream, in every JS
 * runtime. Returns a function yielding floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
