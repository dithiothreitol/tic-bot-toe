/**
 * Core shared types for the game engines.
 *
 * This package is PURE TypeScript — no DOM, no Node APIs — so the exact same
 * engine code runs in the browser (playing) and on the server (replay
 * validation, SPEC §5/§15). Keep it that way.
 */

export type GameId = 'tictactoe' | 'battleship';

/** Two sides. p1 always moves first. */
export type PlayerSide = 'p1' | 'p2';

export type GameStatus = 'playing' | 'p1_won' | 'p2_won' | 'draw';

/**
 * Wire-level move representation: always JSON-serializable so it can be stored
 * verbatim in `matches.moves` and replayed on the server.
 * tic-tac-toe → cell index (number); battleship → coordinate string ("C5").
 */
export type Move = number | string;

export interface Variant {
  id: string;
  /** Human-facing label (Polish). */
  label: string;
}

/** Options handed to `createInitialState`. Game-specific fields are optional. */
export interface SetupConfig {
  /** Deterministic RNG seed — battleship ship placement (recorded per match). */
  seed?: number;
  /** Battleship rule: extra shot after a hit (default true). */
  extraShotOnHit?: boolean;
  /** Battleship: human-supplied ship placement, validated by the engine. */
  placements?: unknown;
}

/**
 * Everything needed to deterministically replay/validate a match on the server
 * (SPEC §15). For battleship this carries ship placements + seed; for
 * tic-tac-toe just the identity fields.
 */
export interface SetupRecord {
  game: GameId;
  variant: string;
  seed?: number;
  [key: string]: unknown;
}

export interface RenderedPrompt {
  system: string;
  user: string;
}

/** Per-move telemetry collected by every provider (SPEC §5, §9). */
export interface MoveTelemetry {
  /** fetch → response, summed across retries. */
  latencyMs: number;
  /** From the API `usage` field; WebLLM runtime stats; `undefined` when absent. */
  promptTokens?: number;
  completionTokens?: number;
  /** Corrective retries used, 0..3. */
  retries: number;
  /** A random legal move was substituted after exhausting retries. */
  forfeit: boolean;
  /** tokens × price snapshot from the catalog at match time. */
  costUsd?: number;
}

export interface MoveResult {
  move: Move;
  telemetry: MoveTelemetry;
  /** Raw model text — kept in memory only, NEVER persisted (SPEC §16). */
  raw?: string;
}

export type MoveQuality = 'optimal' | 'good' | 'weak' | 'blunder';

/** Result of post-game move analysis (SPEC §12.2). */
export interface MoveEval {
  quality: MoveQuality;
  /** Optional human detail (minimax value, shot percentile, …). */
  detail?: string;
}

/**
 * Fields every per-game view carries. The absolute rule (SPEC §5): a model's
 * prompt is built ONLY from its own view — it must never contain hidden
 * information (the opponent's ship layout). Enforced by snapshot tests.
 */
export interface PlayerViewBase {
  game: GameId;
  variant: string;
  /** Which side this view belongs to. */
  side: PlayerSide;
  status: GameStatus;
  /** Number of moves already played in the match. */
  moveNumber: number;
  /** Ordered move history (p1, p2, p1, …). */
  moveHistory: Move[];
}

// ---------------------------------------------------------------------------
// Tic-tac-toe (full information — viewFor returns the complete board)
// ---------------------------------------------------------------------------

export type TicTacToeSymbol = 'X' | 'O';
export type TicTacToeCell = TicTacToeSymbol | null;

export interface TicTacToeView extends PlayerViewBase {
  game: 'tictactoe';
  /** Length 9, indices 0-8 left-to-right, top-to-bottom. */
  board: TicTacToeCell[];
  /** This player's symbol (p1 = X, p2 = O). */
  symbol: TicTacToeSymbol;
}

/**
 * Union of every per-game view. Extended as games are added (battleship in
 * Stage 3). `renderPrompt`/`parseMove` narrow on `view.game`.
 */
export type PlayerView = TicTacToeView;

// ---------------------------------------------------------------------------
// Multi-game contract
// ---------------------------------------------------------------------------

export interface GameDefinition<S, M extends Move> {
  id: GameId;
  variants: Variant[];
  createInitialState(variant: Variant, config: SetupConfig): S;
  /**
   * Whose turn it is. Non-trivial for games where a side moves again (e.g.
   * battleship's extra shot after a hit), so it lives in the engine, not the
   * orchestrator.
   */
  currentPlayer(state: S): PlayerSide;
  /** Legal moves for `player` — empty when it is not their turn or game over. */
  legalMoves(state: S, player: PlayerSide): M[];
  /** Immutable; throws on an illegal move (wrong turn / occupied / over). */
  applyMove(state: S, player: PlayerSide, move: M): S;
  status(state: S): GameStatus;
  /** Hidden-information games: never leak the opponent's secret state. */
  viewFor(state: S, player: PlayerSide): PlayerView;
  renderPrompt(view: PlayerView, legal: M[]): RenderedPrompt;
  parseMove(raw: string, legal: M[]): M | null;
  serializeSetup(state: S): SetupRecord;
  /** Optional post-game analysis (SPEC §12.2), added per game in Stage 10. */
  evaluateMove?(state: S, player: PlayerSide, move: M): MoveEval;
}

export interface Player {
  /** "openrouter:<model>", "webllm:<model>", "ollama:<model>", "human". */
  id: string;
  displayName: string;
  kind: 'human' | 'llm';
  getMove(view: PlayerView, legal: Move[]): Promise<MoveResult>;
}
