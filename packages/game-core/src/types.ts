/**
 * Core shared types for the game engines.
 *
 * This package is PURE TypeScript — no DOM, no Node APIs — so the exact same
 * engine code runs in the browser (playing) and on the server (replay
 * validation, SPEC §5/§15). Keep it that way.
 */

// Grows per game IN LOCKSTEP with its engine + PlayerView member + UI label maps
// (plan §3, but sequenced per DECISIONS.md): 'sudoku' lands in Etap 1, 'scrabble'
// in Etap 5. Widening it ahead of those breaks the exhaustive label maps in the
// web app, so it stays minimal until each game is actually wired.
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

/**
 * Prompt-shaping knobs handed to `renderPrompt`. Empty/undefined = the fixed
 * SPEC §8 default (terse, JSON-only, no reasoning).
 */
export interface PromptOptions {
  /**
   * Let the model reason briefly before answering and drop the "no explanation"
   * gag. This is the single biggest lever on real playing strength for a game
   * like tic-tac-toe — the default prompt forbids chain-of-thought, which is
   * exactly what these models need to stop blundering. Callers pair it with a
   * higher `max_tokens` (the terse default truncates the reasoning otherwise).
   *
   * It NEVER changes the move format: the answer is still the same JSON object,
   * so `parseMove` and server-side replay are untouched. Because it changes how
   * strong a model plays, reasoning matches are kept out of Elo (saved as lab).
   */
  reasoning?: boolean;
}

/** Per-move telemetry collected by every provider (SPEC §5, §9). */
/**
 * Why a forfeit happened (SPEC §8). Set ONLY when `forfeit` is true and the
 * cause is known — it turns "the app silently plays random moves" into an
 * actionable message. A key can pass the `/key` validity test yet still fail
 * every completion (no balance / throttled / dead model), which is exactly the
 * case this names. `bad_output` means the model answered but never produced a
 * legal move. Runtime diagnostic only: the server strips it on save.
 */
export type MoveErrorReason =
  | 'rate_limited' // HTTP 429 — free model throttled / burst limit hit
  | 'no_credits' // HTTP 402 — key valid but the account has no balance
  | 'auth' // HTTP 401/403 — key rejected for this call
  | 'unavailable' // HTTP 404/5xx — model id dead or provider down
  | 'timeout' // per-move deadline hit / request aborted
  | 'network' // fetch failed (offline / CORS)
  | 'bad_output'; // model responded but never gave a legal move

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
  /** Why the forfeit happened, when known — set only alongside `forfeit`. */
  error?: MoveErrorReason;
  /** tokens × price snapshot from the catalog at match time. */
  costUsd?: number;
}

export interface MoveResult {
  move: Move;
  telemetry: MoveTelemetry;
  /** Raw model text — kept in memory only, NEVER persisted (SPEC §16). */
  raw?: string;
}

/**
 * Result of validating a single move against a VIEW (SPEC §5 / plan §3). Games
 * whose legal-move set is too large to enumerate (scrabble) or must stay hidden
 * from the model (sudoku candidates) validate a concrete move instead of listing
 * every option. `reason` is a short English phrase that flows into the corrective
 * retry message (SPEC §8).
 */
export interface MoveRejection {
  ok: false;
  reason: string;
}
export type MoveValidation = { ok: true } | MoveRejection;

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

// ---------------------------------------------------------------------------
// Battleship (HIDDEN information — the view must NEVER leak enemy ship layout)
// ---------------------------------------------------------------------------

/** A cell on the player's own board. */
export type BattleshipOwnCell = 'water' | 'ship' | 'ship-hit' | 'miss';

/** A cell on the tracking board (what the player knows about the enemy). */
export type BattleshipTrackingCell = 'unknown' | 'miss' | 'hit' | 'sunk';

export interface BattleshipView extends PlayerViewBase {
  game: 'battleship';
  size: number; // N (board is N×N)
  extraShotOnHit: boolean;
  /** Own fleet + incoming fire (row-major, length N·N). Safe: it's the player's own board. */
  ownBoard: BattleshipOwnCell[];
  /**
   * What the player knows about the enemy board (row-major, length N·N).
   * Only fired cells carry information — the rest are 'unknown'. This is the
   * ONLY enemy data in the view: raw enemy ship positions never appear here.
   */
  trackingBoard: BattleshipTrackingCell[];
  /** Lengths of enemy ships not yet sunk. */
  enemyShipsRemaining: number[];
  /** Coordinate strings ("A1"…) not yet fired at. */
  legalTargets: string[];
}

/**
 * Union of every per-game view. `renderPrompt`/`parseMove` narrow on `view.game`.
 */
export type PlayerView = TicTacToeView | BattleshipView;

// ---------------------------------------------------------------------------
// Multi-game contract
// ---------------------------------------------------------------------------

export interface GameDefinition<
  S,
  M extends Move,
  V extends PlayerView = PlayerView,
> {
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
  viewFor(state: S, player: PlayerSide): V;
  renderPrompt(view: V, legal: M[], opts?: PromptOptions): RenderedPrompt;
  parseMove(raw: string, legal: M[]): M | null;
  serializeSetup(state: S): SetupRecord;
  /** Optional post-game analysis (SPEC §12.2), added per game in Stage 10. */
  evaluateMove?(state: S, player: PlayerSide, move: M): MoveEval;

  // --- Optional hooks for games whose legal set can't/shouldn't be enumerated
  //     in the prompt (plan §3). Default paths below are used when unset, so
  //     tic-tac-toe and battleship are unaffected. ---

  /**
   * Validate a concrete move from the perspective of a VIEW (not the full
   * state) — the llm-runner and the human UI only ever hold a view. When
   * defined, this REPLACES `legal.includes(move)` as the legality test. Must be
   * pure and deterministic. `parseMove` then only needs to recover the move
   * SYNTACTICALLY; legality is decided here.
   */
  validateMove?(view: V, move: M): MoveValidation;

  /**
   * Corrective message after an illegal/unparseable move — replaces the default
   * "Choose ONLY from: <full legal list>". Receives the rejection reason when a
   * move was parsed but rejected (undefined when parsing failed outright).
   */
  renderCorrection?(view: V, rejection?: MoveRejection): string;

  /**
   * Substitute move on forfeit — replaces the default "random pick from
   * `legalMoves()`". Scrabble returns 'PASS'; sudoku keeps the default. `rng`
   * yields floats in [0, 1).
   */
  fallbackMove?(view: V, legal: M[], rng: () => number): M;
}

export interface Player {
  /** "openrouter:<model>", "webllm:<model>", "ollama:<model>", "human". */
  id: string;
  displayName: string;
  kind: 'human' | 'llm';
  getMove(view: PlayerView, legal: Move[]): Promise<MoveResult>;
}
