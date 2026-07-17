/**
 * Post-game analysis (SPEC §12.2). Replays a match through the SAME engine as
 * play/validation and classifies every move. Runs identically on the client
 * (analysis screen) and the server (eval revalidation, §15.1) — the server
 * recomputes this and never trusts the client's `eval`.
 */
import { type BattleshipState, battleship, cellToCoord, coordToCell } from '../battleship';
import { type SudokuState, sudoku } from '../sudoku';
import { type TicTacToeState, symbolFor, ticTacToe } from '../tictactoe';
import type {
  GameId,
  Move,
  MoveQuality,
  PlayerSide,
  SetupConfig,
  SetupRecord,
  Variant,
} from '../types';
import { classifyBattleshipShot } from './battleship';
import { classifyTicTacToeMove } from './tictactoe';
import type { GameAnalysis, MoveAnalysis, PlayerAccuracy } from './types';

export * from './types';
export { classifyTicTacToeMove, ttMoveValues } from './tictactoe';
export { classifyBattleshipShot, battleshipHeatMap } from './battleship';

export interface AnalyzedMove {
  player: PlayerSide;
  move: Move;
}

function configFromSetup(setup: SetupRecord | null | undefined): SetupConfig {
  if (!setup) return {};
  return {
    seed: typeof setup.seed === 'number' ? setup.seed : undefined,
    extraShotOnHit: typeof setup.extraShotOnHit === 'boolean' ? setup.extraShotOnHit : undefined,
    placements: setup.placements,
  };
}

function emptyAccuracy(): Record<PlayerSide, PlayerAccuracy> {
  return {
    p1: { moves: 0, optimal: 0, rate: 0 },
    p2: { moves: 0, optimal: 0, rate: 0 },
  };
}

/**
 * Classify each move of a match. Mirrors `replayMatch` reconstruction, so it
 * assumes the moves are already legal (validate first on the server).
 */
export function analyzeMatch(
  game: GameId,
  variant: string,
  setup: SetupRecord | null | undefined,
  moves: AnalyzedMove[],
): GameAnalysis {
  // Scrabble has no per-move analysis (plan §12) — return an empty result so the
  // client analysis screen and the server's eval revalidation both no-op for it.
  if (game === 'scrabble') {
    return { game, moves: [], accuracy: emptyAccuracy(), turningPoint: null };
  }

  const engine =
    game === 'tictactoe' ? ticTacToe : game === 'sudoku' ? sudoku : battleship;
  const variantObj: Variant = engine.variants.find((v) => v.id === variant) ?? {
    id: variant,
    label: variant,
  };

  const analyses: MoveAnalysis[] = [];
  const accuracy = emptyAccuracy();
  let turningPoint: number | null = null;

  if (game === 'tictactoe') {
    let state = ticTacToe.createInitialState(variantObj, {});
    moves.forEach((m, i) => {
      const quality = classifyTicTacToeMove(state.board, m.move as number, symbolFor(m.player));
      record(analyses, accuracy, i, m.player, m.move, quality);
      if (quality === 'blunder' && turningPoint === null) turningPoint = i;
      state = ticTacToe.applyMove(state, m.player, m.move as number);
    });
  } else if (game === 'sudoku') {
    // The engine grades sudoku itself (naked/hidden single → optimal, correct but
    // unforced → good, wrong → blunder). evaluateMove reads the state BEFORE the
    // move, exactly what this loop holds.
    let state: SudokuState = sudoku.createInitialState(variantObj, configFromSetup(setup));
    moves.forEach((m, i) => {
      const quality = sudoku.evaluateMove!(state, m.player, m.move as string).quality;
      record(analyses, accuracy, i, m.player, m.move, quality);
      if (quality === 'blunder' && turningPoint === null) turningPoint = i;
      state = sudoku.applyMove(state, m.player, m.move as string);
    });
  } else {
    let state: BattleshipState = battleship.createInitialState(variantObj, configFromSetup(setup));
    moves.forEach((m, i) => {
      const view = battleship.viewFor(state, m.player);
      const cell = coordToCell(m.move as string, state.size);
      const quality: MoveQuality = cell === null ? 'weak' : classifyBattleshipShot(view, cell);
      record(analyses, accuracy, i, m.player, m.move, quality);
      if (quality === 'blunder' && turningPoint === null) turningPoint = i;
      state = battleship.applyMove(state, m.player, m.move as string);
    });
  }

  for (const side of ['p1', 'p2'] as const) {
    const a = accuracy[side];
    a.rate = a.moves > 0 ? a.optimal / a.moves : 0;
  }

  return { game, moves: analyses, accuracy, turningPoint };
}

function record(
  analyses: MoveAnalysis[],
  accuracy: Record<PlayerSide, PlayerAccuracy>,
  index: number,
  player: PlayerSide,
  move: Move,
  quality: MoveQuality,
): void {
  analyses.push({ index, player, move, quality });
  accuracy[player].moves += 1;
  if (quality === 'optimal') accuracy[player].optimal += 1;
}

/** Convenience for the analysis screen when the caller holds the final ttt state. */
export function analyzeTicTacToe(state: TicTacToeState): GameAnalysis {
  const moves: AnalyzedMove[] = state.moves.map((cell, i) => ({
    player: i % 2 === 0 ? 'p1' : 'p2',
    move: cell,
  }));
  return analyzeMatch('tictactoe', state.variant, null, moves);
}

/** Convenience for the analysis screen when the caller holds the final battleship state. */
export function analyzeBattleship(state: BattleshipState): GameAnalysis {
  const setup = battleship.serializeSetup(state);
  const moves: AnalyzedMove[] = state.moves.map((m) => ({
    player: m.by,
    move: cellToCoord(m.cell, state.size),
  }));
  return analyzeMatch('battleship', state.variant, setup, moves);
}
