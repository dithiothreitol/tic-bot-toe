import type { Move } from '@arena/game-core';

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** Missing token usage renders as "—", never 0 (SPEC §20.1). */
export function formatTokens(n: number | undefined): string {
  return n === undefined ? '—' : n.toLocaleString('pl-PL');
}

export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return '—';
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

/** Price per 1M tokens, for the model picker. */
export function formatPricePerMillion(perToken: number): string {
  if (perToken === 0) return 'darmowy';
  return `$${(perToken * 1_000_000).toFixed(2)}/M`;
}

export function formatMove(move: Move): string {
  return String(move);
}
