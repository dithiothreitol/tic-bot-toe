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
  while (def.status(state) === 'playing') {
    if (opts.signal?.aborted || moves.length >= maxMoves) {
      aborted = true;
      break;
    }
    const side = def.currentPlayer(state);
    const view = def.viewFor(state, side);
    const legal = def.legalMoves(state, side);

    const result = await raceAbort(opts.players[side].getMove(view, legal), opts.signal);
    if (result === ABORTED) {
      aborted = true;
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
  };
  opts.onEnd?.(outcome);
  return outcome;
}
