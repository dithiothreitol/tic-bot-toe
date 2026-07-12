/**
 * Elo rating (SPEC §10): start 1000, K=32, draw = 0.5. Pure functions with
 * tests — the server is the single source of truth for rating updates.
 */
export const ELO_START = 1000;
export const ELO_K = 32;

export type Winner = 'p1' | 'p2' | 'draw';

/** Expected score of A against B (0..1). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** p1's actual score for a result. */
export function scoreForP1(winner: Winner): number {
  return winner === 'p1' ? 1 : winner === 'p2' ? 0 : 0.5;
}

/** New ratings after a game (a = p1, b = p2). */
export function updateElo(
  ratingA: number,
  ratingB: number,
  winner: Winner,
  k: number = ELO_K,
): { a: number; b: number } {
  const scoreA = scoreForP1(winner);
  const expectedA = expectedScore(ratingA, ratingB);
  const deltaA = k * (scoreA - expectedA);
  return { a: ratingA + deltaA, b: ratingB - deltaA };
}
