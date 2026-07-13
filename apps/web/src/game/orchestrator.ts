import {
  type GameDefinition,
  type GameId,
  type GameStatus,
  type Move,
  type MoveTelemetry,
  type Player,
  type PlayerSide,
  type SetupConfig,
  type SetupRecord,
  type Variant,
  getGame,
} from '@arena/game-core';

/**
 * Game-agnostic match orchestrator (SPEC §5): view → player → validate → apply
 * → log (move + telemetry). Works for both modes; the mode is just a label
 * carried into the outcome for storage.
 */

export type MatchMode = 'model_vs_model' | 'human_vs_model';

/**
 * Why a match stopped early. `user` = someone hit STOP (or the tab closed);
 * `stalled` = too many forced/invalid moves in a row (the models can't play);
 * `budget` = the token budget for the match was spent; `fuse` = the
 * `safetyMaxMoves` cap against a non-terminating game. Null when the match
 * finished on its own.
 */
export type AbortReason = 'user' | 'stalled' | 'budget' | 'fuse';

export interface MoveLogEntry {
  index: number;
  player: PlayerSide;
  move: Move;
  telemetry: MoveTelemetry;
}

export interface MatchSnapshot {
  /** Concrete engine state (cast per game by the renderer). */
  state: unknown;
  status: GameStatus;
  toMove: PlayerSide;
  moveCount: number;
}

export interface MatchOutcome {
  mode: MatchMode;
  game: GameId;
  variant: string;
  p1Id: string;
  p2Id: string;
  winner: 'p1' | 'p2' | 'draw' | null;
  status: GameStatus;
  moves: MoveLogEntry[];
  setup: SetupRecord;
  /** True when the loop stopped early (external abort or safety fuse). */
  aborted: boolean;
  /** Why it stopped early — null unless `aborted`. Drives the UI message. */
  abortReason: AbortReason | null;
}

export interface RunMatchOptions {
  mode: MatchMode;
  game: GameId;
  variant: Variant;
  config?: SetupConfig;
  players: Record<PlayerSide, Player>;
  onStart?: (snapshot: MatchSnapshot) => void;
  onMove?: (entry: MoveLogEntry, snapshot: MatchSnapshot) => void;
  onEnd?: (outcome: MatchOutcome) => void;
  signal?: AbortSignal;
  /** Fuse against non-terminating games (battleship 2·N²). */
  safetyMaxMoves?: number;
  /**
   * Auto-stop a stalled match after this many FORCED/invalid moves in a row
   * (`telemetry.forfeit`). When both models can't produce a legal move the match
   * degenerates into forced random moves that burn tokens for nothing — this
   * kills it. 0/undefined = never (default).
   */
  maxConsecutiveForfeits?: number;
  /**
   * Auto-stop once cumulative prompt+completion tokens across the match reach
   * this budget. A second safety net against a match quietly burning tokens.
   * 0/undefined = no budget (default).
   */
  maxTokens?: number;
}

const DEFAULT_SAFETY_MAX_MOVES = 1000;
const ABORTED = Symbol('aborted');

/** Resolve the move, or ABORTED if the signal fires first (so a human match can be stopped mid-think). */
function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T | typeof ABORTED> {
  if (!signal) return p;
  if (signal.aborted) return Promise.resolve(ABORTED);
  return new Promise((resolve) => {
    const onAbort = (): void => resolve(ABORTED);
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve(ABORTED);
      },
    );
  });
}

function statusToWinner(status: GameStatus): 'p1' | 'p2' | 'draw' | null {
  switch (status) {
    case 'p1_won':
      return 'p1';
    case 'p2_won':
      return 'p2';
    case 'draw':
      return 'draw';
    default:
      return null;
  }
}

export async function runMatch(opts: RunMatchOptions): Promise<MatchOutcome> {
  const def = getGame(opts.game) as GameDefinition<unknown, Move>;
  let state = def.createInitialState(opts.variant, opts.config ?? {});
  const moves: MoveLogEntry[] = [];
  const maxMoves = opts.safetyMaxMoves ?? DEFAULT_SAFETY_MAX_MOVES;

  const snapshot = (): MatchSnapshot => ({
    state,
    status: def.status(state),
    toMove: def.currentPlayer(state),
    moveCount: moves.length,
  });

  opts.onStart?.(snapshot());

  let aborted = false;
  let abortReason: AbortReason | null = null;
  let consecutiveForfeits = 0;
  let tokensUsed = 0;
  while (def.status(state) === 'playing') {
    if (opts.signal?.aborted) {
      aborted = true;
      abortReason = 'user';
      break;
    }
    if (moves.length >= maxMoves) {
      aborted = true;
      abortReason = 'fuse';
      break;
    }
    const side = def.currentPlayer(state);
    const view = def.viewFor(state, side);
    const legal = def.legalMoves(state, side);

    const result = await raceAbort(opts.players[side].getMove(view, legal), opts.signal);
    if (result === ABORTED) {
      aborted = true;
      abortReason = 'user';
      break;
    }

    state = def.applyMove(state, side, result.move);
    const entry: MoveLogEntry = {
      index: moves.length,
      player: side,
      move: result.move,
      telemetry: result.telemetry,
    };
    moves.push(entry);
    opts.onMove?.(entry, snapshot());

    // Auto-stop guards (SPEC safety): a run of forced moves means the models
    // can't play, and a blown token budget means it's not worth continuing.
    consecutiveForfeits = entry.telemetry.forfeit ? consecutiveForfeits + 1 : 0;
    tokensUsed +=
      (entry.telemetry.promptTokens ?? 0) + (entry.telemetry.completionTokens ?? 0);
    if (opts.maxConsecutiveForfeits && consecutiveForfeits >= opts.maxConsecutiveForfeits) {
      aborted = true;
      abortReason = 'stalled';
      break;
    }
    if (opts.maxTokens && tokensUsed >= opts.maxTokens) {
      aborted = true;
      abortReason = 'budget';
      break;
    }
  }

  const status = def.status(state);
  const outcome: MatchOutcome = {
    mode: opts.mode,
    game: opts.game,
    variant: opts.variant.id,
    p1Id: opts.players.p1.id,
    p2Id: opts.players.p2.id,
    winner: aborted ? null : statusToWinner(status),
    status,
    moves,
    setup: def.serializeSetup(state),
    aborted,
    abortReason,
  };
  opts.onEnd?.(outcome);
  return outcome;
}
