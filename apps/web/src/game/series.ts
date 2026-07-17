import type { GameId, Player, PlayerSide, Variant } from '@arena/game-core';

import { type MatchOutcome, type MoveLogEntry, type MatchSnapshot, runMatch } from './orchestrator';

/**
 * „Pojedynek promptów" (Module F, plan §8, D10) — run one model against ITSELF
 * with two different system appendices (A vs B) over a short series, and see which
 * prompt plays better. Lab-only and fully local: the appendix text never leaves
 * the browser (D10).
 *
 * Fairness: the first move is an advantage, so the sides SWAP every game — prompt
 * A is p1 on even games, p2 on odd ones. Determinism: each game's seed is
 * `seriesSeed + k`, so the same series can be replayed move-for-move.
 *
 * Pure enough to test: `runMatch` is injectable (`opts.runner`), so a fake match
 * runner drives the side-swap / seed / aggregation / abort assertions without an
 * LLM.
 */

export type PromptId = 'A' | 'B';

export interface SeriesGameResult {
  /** 0-based game index. */
  index: number;
  /** Which side prompt A played this game (swaps each game). */
  aSide: PlayerSide;
  /** Raw winner side, or 'draw'/null (null = the game was aborted). */
  winner: 'p1' | 'p2' | 'draw' | null;
  /** Winner translated into prompt terms — the thing the duel actually measures. */
  promptWinner: PromptId | 'draw' | null;
  outcome: MatchOutcome;
}

export interface SeriesAggregate {
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  tokensA: number;
  tokensB: number;
  costA: number;
  costB: number;
  forfeitA: number;
  forfeitB: number;
}

export interface RunSeriesOptions {
  game: GameId;
  variant: Variant;
  seriesLength: number;
  seriesSeed: number;
  appendixA: string;
  appendixB: string;
  /** Build a player for the duel model carrying `appendix` — the ONLY thing that differs A↔B. */
  buildPlayer: (appendix: string) => Player;
  extraShotOnHit?: boolean;
  safetyMaxMoves?: number;
  maxConsecutiveForfeits?: number;
  maxTokens?: number;
  /** Fires after each completed game with that game's result + the running total. */
  onGameEnd?: (result: SeriesGameResult, aggregate: SeriesAggregate) => void;
  /** Fires on every move of the current game — lets the UI show a live board. */
  onMove?: (entry: MoveLogEntry, snapshot: MatchSnapshot, gameIndex: number) => void;
  signal?: AbortSignal;
  /** Injectable for tests (defaults to the real orchestrator). */
  runner?: typeof runMatch;
}

function emptyAggregate(): SeriesAggregate {
  return {
    games: 0,
    aWins: 0,
    bWins: 0,
    draws: 0,
    tokensA: 0,
    tokensB: 0,
    costA: 0,
    costB: 0,
    forfeitA: 0,
    forfeitB: 0,
  };
}

function movesTokens(m: MoveLogEntry): number {
  return (m.telemetry.promptTokens ?? 0) + (m.telemetry.completionTokens ?? 0);
}

/** Fold one finished game into the running totals, attributing each side to its prompt. */
function accumulate(agg: SeriesAggregate, result: SeriesGameResult): void {
  agg.games += 1;
  if (result.promptWinner === 'A') agg.aWins += 1;
  else if (result.promptWinner === 'B') agg.bWins += 1;
  else if (result.promptWinner === 'draw') agg.draws += 1;

  for (const m of result.outcome.moves) {
    const isA = m.player === result.aSide;
    const tokens = movesTokens(m);
    const cost = m.telemetry.costUsd ?? 0;
    const forfeit = m.telemetry.forfeit ? 1 : 0;
    if (isA) {
      agg.tokensA += tokens;
      agg.costA += cost;
      agg.forfeitA += forfeit;
    } else {
      agg.tokensB += tokens;
      agg.costB += cost;
      agg.forfeitB += forfeit;
    }
  }
}

/** Translate a raw winner side into which PROMPT won, given who played prompt A. */
function toPromptWinner(
  winner: 'p1' | 'p2' | 'draw' | null,
  aSide: PlayerSide,
): PromptId | 'draw' | null {
  if (winner === 'draw') return 'draw';
  if (winner === null) return null;
  return winner === aSide ? 'A' : 'B';
}

export async function runSeries(opts: RunSeriesOptions): Promise<SeriesAggregate> {
  const run = opts.runner ?? runMatch;
  const agg = emptyAggregate();

  for (let k = 0; k < opts.seriesLength; k++) {
    if (opts.signal?.aborted) break;

    // Swap sides each game so neither prompt keeps the first-move advantage.
    const aSide: PlayerSide = k % 2 === 0 ? 'p1' : 'p2';
    const p1Appendix = aSide === 'p1' ? opts.appendixA : opts.appendixB;
    const p2Appendix = aSide === 'p1' ? opts.appendixB : opts.appendixA;

    const outcome = await run({
      mode: 'model_vs_model',
      game: opts.game,
      variant: opts.variant,
      config: { seed: opts.seriesSeed + k, extraShotOnHit: opts.extraShotOnHit },
      players: {
        p1: opts.buildPlayer(p1Appendix),
        p2: opts.buildPlayer(p2Appendix),
      },
      signal: opts.signal,
      safetyMaxMoves: opts.safetyMaxMoves,
      maxConsecutiveForfeits: opts.maxConsecutiveForfeits,
      maxTokens: opts.maxTokens,
      onMove: opts.onMove ? (entry, snap) => opts.onMove!(entry, snap, k) : undefined,
    });

    // A game cut short by abort has no winner — don't score it, and stop here.
    if (outcome.aborted) break;

    const result: SeriesGameResult = {
      index: k,
      aSide,
      winner: outcome.winner,
      promptWinner: toPromptWinner(outcome.winner, aSide),
      outcome,
    };
    accumulate(agg, result);
    opts.onGameEnd?.(result, agg);
  }

  return agg;
}
