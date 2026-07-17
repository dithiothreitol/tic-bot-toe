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
export type GameId = 'tictactoe' | 'battleship' | 'sudoku' | 'scrabble';

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

/**
 * Persistence caps for the controlled §16 exception (plan „efekt wow" §2, D1/D4).
 *
 * The arena normally persists NOTHING a model or a human wrote (SPEC §16); these
 * bound the one exception — a trimmed reasoning trace (Module A) and short
 * excerpts of REJECTED model output (Module B). The client trims to these before
 * a save. The server enforces its OWN, independent ceilings (zod + a pre-insert
 * trim) so a hand-crafted payload can't smuggle more in — do NOT import these
 * constants web→server; the server keeps its numbers locally on purpose.
 */
export const THOUGHTS_MAX_CHARS = 1500;
export const REJECTION_REASON_MAX_CHARS = 200;
export const REJECTION_ATTEMPTED_MAX_CHARS = 40;
export const REJECTION_RAW_MAX_CHARS = 240;
/** One rejection per attempt at most: the first try plus `maxRetries` (=3) corrections. */
export const MAX_REJECTIONS_PER_MOVE = 4;

export type MoveRejectionKind = 'illegal' | 'unparseable' | 'transport';

/**
 * One rejected attempt at a single move (Module B — the „hallucination museum").
 * - `illegal`: a move was parsed but the engine refused it (`reason`/`attempted` set).
 * - `unparseable`: no move could be recovered from the reply (`raw` excerpt only).
 * - `transport`: the provider call itself failed — no `raw` (nothing was returned
 *   to quote); the cause already rides on `MoveTelemetry.error` at forfeit.
 */
export interface MoveRejectionRecord {
  kind: MoveRejectionKind;
  /** Engine's short English rejection reason — `illegal` only. */
  reason?: string;
  /** The concrete move the engine refused; for scrabble the notation carrying the invented word. */
  attempted?: string;
  /** Short excerpt of the model's own rejected output. NEVER present for `transport`. */
  raw?: string;
}

export interface MoveResult {
  move: Move;
  telemetry: MoveTelemetry;
  /** Raw model text — kept in memory only, NEVER persisted (SPEC §16). */
  raw?: string;
  /**
   * Reasoning trace for this move (Module A — „tok myślenia"). Present only when
   * the provider surfaced one; trimmed to THOUGHTS_MAX_CHARS. Persisted only on
   * an explicit save (controlled §16 exception, D1). The runner starts populating
   * it in a later stage; the field lands here first (plan §10 Etap 0) so it
   * survives the whole save→replay path the moment there is data to carry.
   */
  thoughts?: string;
  /** Rejected attempts at this move (Module B). Same staging note as `thoughts`. */
  rejections?: MoveRejectionRecord[];
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

// ---------------------------------------------------------------------------
// Sudoku Duel (full information — but the SOLUTION is NEVER in the view)
// ---------------------------------------------------------------------------

/** One resolved placement, visible to both sides — mistakes must cost publicly. */
export interface SudokuAnnotatedEntry {
  player: PlayerSide;
  /** 1-indexed coordinate, e.g. "r4c7". */
  cell: string;
  digit: number;
  /** true = matched the unique solution (+1); false = consistent but wrong (−1, reverted). */
  correct: boolean;
}

export interface SudokuView extends PlayerViewBase {
  game: 'sudoku';
  size: number;
  boxRows: number;
  boxCols: number;
  /** Current board (row-major, length size²); null = empty. Always a subset of the solution. */
  board: (number | null)[];
  /** Starting clues (immutable), row-major. */
  givenMask: boolean[];
  scores: { p1: number; p2: number };
  /** Resolved placements with their outcome — the model must see that mistakes cost. */
  annotatedHistory: SudokuAnnotatedEntry[];
  /** Moves left before the engine's hard cap ends the game. */
  movesRemaining: number;
}

// ---------------------------------------------------------------------------
// Scrabble / "Word Battle" (HIDDEN information — never leak the opponent's rack
// or the bag order)
// ---------------------------------------------------------------------------

/** A tile placed on the board. A blank plays a letter but is always worth 0. */
export interface PlacedTile {
  /** The letter this tile shows (a blank's chosen letter). */
  letter: string;
  isBlank: boolean;
  points: number;
}

export interface ScrabbleWordScore {
  word: string;
  score: number;
}

export interface ScrabbleAnnotatedEntry {
  player: PlayerSide;
  /** Canonical wire notation ("H8>KOTY", "EXCH:AB", "PASS"). */
  notation: string;
  words: ScrabbleWordScore[];
  total: number;
}

export interface ScrabbleView extends PlayerViewBase {
  game: 'scrabble';
  language: 'pl' | 'en';
  /** Row-major, length 225. */
  board: (PlacedTile | null)[];
  /** ONLY this player's rack ('?' = blank). Never the opponent's. */
  rack: string[];
  scores: { p1: number; p2: number };
  bagCount: number;
  opponentRackCount: number;
  scorelessStreak: number;
  annotatedHistory: ScrabbleAnnotatedEntry[];
  /** The board carries premium markers on empty squares (prompt legend). */
  premiumsLegend: true;
}

/**
 * Union of every per-game view. `renderPrompt`/`parseMove` narrow on `view.game`.
 */
export type PlayerView = TicTacToeView | BattleshipView | SudokuView | ScrabbleView;

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
