import {
  type BattleshipState,
  type CommentRequest,
  type CommentaryLocale,
  type GameId,
  type Move,
  type MoveQuality,
  type PlayerSide,
  type SudokuState,
  type TicTacToeState,
  battleship,
  buildCommentaryPrompt,
  classifyBattleshipShot,
  classifyTicTacToeMove,
  coordToCell,
  sudoku,
  symbolFor,
  trimToTwoSentences,
} from '@arena/game-core';

import { apiPost } from '@/api/client';
import type { Locale } from '@/i18n';

import type { ChatTransport } from './llm-runner';

/**
 * AI commentator (SPEC §12.1) — a THIRD model narrating the match in the UI
 * language. It never enters `players`, so it cannot influence a single move; it
 * only watches, and its calls are fire-and-forget so it can never block the game.
 *
 * Two sources, the user picks one (SetupScreen):
 *  - BYOK: their own model on their own key/provider (`chatCommentate`), exactly
 *    like a player — off by default, on the user's dime.
 *  - Server coach: a Gemini model funded by the app owner (`serverCommentate`).
 *    The key is a SERVER secret; the browser never sees it, and the prompt is
 *    built server-side from structured input (see game-core/commentary.ts).
 *
 * The prompt itself lives in game-core so both this client and the server build
 * it identically — re-exported here for the components and tests that used it.
 */
export {
  type CommentRequest,
  buildCommentaryPrompt,
  describeGodView,
  shouldComment,
  trimToTwoSentences,
} from '@arena/game-core';

export interface Commentary {
  moveIndex: number;
  text: string;
  modelId: string;
}

// ---------------------------------------------------------------------------
// Where a comment's text comes from — one function, two implementations
// ---------------------------------------------------------------------------

/**
 * Turn a `CommentRequest` into commentary text (untrimmed; the queue trims).
 * Rejects on failure — the queue swallows it, since the commentator is decor.
 */
export type Commentate = (req: CommentRequest, signal: AbortSignal) => Promise<string>;

/** BYOK: build the prompt here and call the user's own provider transport. */
export function chatCommentate(transport: ChatTransport, locale: Locale): Commentate {
  return async (req, signal) => {
    const { system, user } = buildCommentaryPrompt(req, locale as CommentaryLocale);
    const res = await transport(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      signal,
    );
    return res.text;
  };
}

/**
 * Server coach: send the STRUCTURED request to our backend, which holds the
 * Gemini key and builds the prompt itself. The browser sends no prompt and no
 * key — it cannot turn the endpoint into an arbitrary-text proxy.
 */
export function serverCommentate(locale: Locale): Commentate {
  return async (req, signal) => {
    const res = await apiPost<{ text: string }>(
      '/api/commentary',
      {
        locale,
        game: req.game,
        moveIndex: req.moveIndex,
        player: req.player,
        playerName: req.playerName,
        move: req.move,
        quality: req.quality,
        state: req.state,
        isFinal: req.isFinal,
        winnerName: req.winnerName ?? null,
      },
      {},
      { signal },
    );
    return res.text;
  };
}

// ---------------------------------------------------------------------------
// Move classification (reuses the §12.2 solvers, incrementally)
// ---------------------------------------------------------------------------

/**
 * Quality of one move, from the state BEFORE it. Incremental on purpose: calling
 * `analyzeMatch` after every move would re-run the battleship heat map from
 * scratch each time.
 */
export function classifyLastMove(
  game: GameId,
  stateBefore: unknown,
  player: PlayerSide,
  move: Move,
): MoveQuality {
  if (game === 'tictactoe') {
    const s = stateBefore as TicTacToeState;
    return classifyTicTacToeMove(s.board, move as number, symbolFor(player));
  }
  if (game === 'sudoku') {
    // The engine grades sudoku itself from the state before the move.
    return sudoku.evaluateMove!(stateBefore as SudokuState, player, move as string).quality;
  }
  const s = stateBefore as BattleshipState;
  const cell = coordToCell(move as string, s.size);
  if (cell === null) return 'weak';
  return classifyBattleshipShot(battleship.viewFor(s, player), cell);
}

// ---------------------------------------------------------------------------
// Fire-and-forget queue
// ---------------------------------------------------------------------------

export interface CommentatorOptions {
  /** How a request becomes text — `chatCommentate` (BYOK) or `serverCommentate`. */
  commentate: Commentate;
  /** Label attached to each comment, e.g. `openrouter:gpt-4o-mini` or `server`. */
  modelId: string;
  onComment: (c: Commentary) => void;
  /**
   * Notified when a comment fails (still swallowed — the game never stalls).
   * The server coach uses it to nudge toward BYOK once it is rate-limited.
   */
  onError?: (err: unknown) => void;
  /** Cap on in-flight + queued work, so a slow model can't pile up cost. */
  maxPending?: number;
  timeoutMs?: number;
}

export interface Commentator {
  /** Never throws, never blocks — returns immediately. */
  enqueue: (req: CommentRequest) => void;
  stop: () => void;
}

const DEFAULT_MAX_PENDING = 3;
const DEFAULT_TIMEOUT_MS = 20_000;

export function createCommentator(opts: CommentatorOptions): Commentator {
  const queue: CommentRequest[] = [];
  const maxPending = opts.maxPending ?? DEFAULT_MAX_PENDING;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let running = false;
  let stopped = false;

  const drain = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    while (queue.length > 0 && !stopped) {
      const req = queue.shift()!;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const raw = await opts.commentate(req, controller.signal);
        const text = trimToTwoSentences(raw);
        // A late comment still knows which move it was about (§12.1).
        if (text && !stopped) {
          opts.onComment({ moveIndex: req.moveIndex, text, modelId: opts.modelId });
        }
      } catch (err) {
        // The commentator is decoration: a failure never surfaces as a game
        // error. `onError` is an out-of-band hook (e.g. a BYOK nudge) and is
        // itself guarded so it can't break the drain loop.
        try {
          opts.onError?.(err);
        } catch {
          /* ignore */
        }
      } finally {
        clearTimeout(timer);
      }
    }
    running = false;
  };

  return {
    enqueue: (req) => {
      if (stopped) return;
      // Drop the oldest pending request rather than the newest: the freshest
      // position is the one worth talking about.
      if (queue.length >= maxPending) queue.shift();
      queue.push(req);
      void drain();
    },
    stop: () => {
      stopped = true;
      queue.length = 0;
    },
  };
}
