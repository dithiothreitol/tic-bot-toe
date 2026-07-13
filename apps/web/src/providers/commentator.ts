import {
  type BattleshipState,
  type GameId,
  type Move,
  type MoveQuality,
  type PlayerSide,
  type TicTacToeCell,
  type TicTacToeState,
  battleship,
  classifyBattleshipShot,
  classifyTicTacToeMove,
  coordToCell,
  symbolFor,
} from '@arena/game-core';

import type { Locale } from '@/i18n';

import type { ChatTransport } from './llm-runner';

/**
 * AI commentator (SPEC §12.1).
 *
 * A THIRD model narrates the match in plain language — in whichever language the
 * interface is in. Two things make it different from a player:
 *
 *  1. It gets the GOD VIEW. It may see both fleets, because it never plays — the
 *     "prompt contains only PlayerView" rule (§5) exists to stop a *player* from
 *     seeing hidden information, and the commentator is not a player. It is
 *     therefore built from engine state directly, never through `viewFor`, and
 *     it is never wired into `runMatch`.
 *  2. It must NEVER block the game. Calls are fire-and-forget through a
 *     single-flight queue; a comment that arrives late still carries its
 *     `moveIndex`, so it is attached to the move it was about (§12.1).
 *
 * Cost: it runs on the user's own key/WebLLM/Ollama, exactly like the players,
 * and is OFF by default (§12.1).
 */

export interface Commentary {
  moveIndex: number;
  text: string;
  modelId: string;
}

export interface CommentRequest {
  game: GameId;
  moveIndex: number;
  player: PlayerSide;
  playerName: string;
  move: Move;
  quality: MoveQuality;
  /** Engine state AFTER the move — the god view the commentator is allowed to see. */
  state: unknown;
  /** True for the last move of the match. */
  isFinal: boolean;
  /** Who won, when the match is over. */
  winnerName?: string | null;
}

// ---------------------------------------------------------------------------
// Which moves are worth a comment (§12.1: "1–2 sentences after SELECTED moves")
// ---------------------------------------------------------------------------

/**
 * Commenting on every move would be noisy and would cost the user money for
 * nothing. Comment on what a human commentator would: mistakes, the opening, the
 * finish, and an occasional beat in between.
 */
export function shouldComment(index: number, quality: MoveQuality, isFinal: boolean): boolean {
  if (isFinal) return true;
  if (quality === 'blunder') return true;
  if (index === 0) return true;
  return index % 3 === 2;
}

// ---------------------------------------------------------------------------
// God-view board rendering
// ---------------------------------------------------------------------------

const TTT_MARK: Record<string, string> = { X: 'X', O: 'O' };

function describeTicTacToe(state: TicTacToeState): string {
  const b: TicTacToeCell[] = state.board;
  const cell = (i: number): string => (b[i] ? TTT_MARK[b[i] as string]! : String(i));
  return [0, 3, 6].map((r) => `${cell(r)} ${cell(r + 1)} ${cell(r + 2)}`).join('\n');
}

const OWN_SYMBOL: Record<string, string> = {
  water: '.',
  ship: 'S',
  'ship-hit': 'X',
  miss: 'o',
};

/** Both fleets, fully revealed. Legal here — and only here (see the file header). */
function describeBattleship(state: BattleshipState): string {
  const grid = (side: PlayerSide): string => {
    const own = battleship.viewFor(state, side).ownBoard;
    const rows: string[] = [];
    for (let r = 0; r < state.size; r++) {
      const cells = own
        .slice(r * state.size, (r + 1) * state.size)
        .map((c) => OWN_SYMBOL[c] ?? '.');
      rows.push(`${String.fromCharCode(65 + r)} ${cells.join(' ')}`);
    }
    const header = `  ${Array.from({ length: state.size }, (_, i) => i + 1).join(' ')}`;
    return [header, ...rows].join('\n');
  };
  return [
    'Player 1 fleet (S=ship, X=hit, o=enemy miss):',
    grid('p1'),
    '',
    'Player 2 fleet (S=ship, X=hit, o=enemy miss):',
    grid('p2'),
  ].join('\n');
}

export function describeGodView(game: GameId, state: unknown): string {
  return game === 'tictactoe'
    ? describeTicTacToe(state as TicTacToeState)
    : describeBattleship(state as BattleshipState);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const QUALITY_EN: Record<MoveQuality, string> = {
  optimal: 'the best move available',
  good: 'a decent move',
  weak: 'a weak move that gives something away',
  blunder: 'a blunder that changes the outcome of the game',
};

/** What the commentary must be written IN — the one prompt detail that is not fixed. */
const OUTPUT_LANGUAGE: Record<Locale, string> = { pl: 'POLISH', en: 'ENGLISH' };

/**
 * The instructions stay English (SPEC §5: model prompts are English, whatever the
 * UI language) — but the OUTPUT is read by the user, so it follows the INTERFACE
 * language. This is the only prompt in the app that does.
 */
export function buildCommentaryPrompt(
  req: CommentRequest,
  locale: Locale = 'pl',
): { system: string; user: string } {
  const language = OUTPUT_LANGUAGE[locale];
  const system = [
    'You are a witty sports commentator for a board-game match between AI models.',
    'You can see the ENTIRE board, including both fleets — you are a commentator, not a player.',
    '',
    'Rules for your answer:',
    `- Write in ${language}.`,
    '- Maximum 2 sentences. Short ones.',
    '- Light, warm, slightly playful tone. Never sarcastic towards the player.',
    '- Explain WHY the move was good or bad, in words a beginner understands.',
    '- No technical jargon: no "minimax", no "heuristic", no "eval", no percentages.',
    '- Do not describe the board layout. Comment on the decision.',
    '- Output the commentary only. No preamble, no quotes, no markdown.',
  ].join('\n');

  const lines = [
    `Game: ${req.game === 'tictactoe' ? 'tic-tac-toe' : 'battleship'}`,
    `Board after the move (god view):`,
    describeGodView(req.game, req.state),
    '',
    `Move ${req.moveIndex + 1}: ${req.playerName} played ${String(req.move)}.`,
    `Our solver rates it as: ${QUALITY_EN[req.quality]}.`,
  ];
  if (req.isFinal) {
    lines.push(
      req.winnerName
        ? `This ended the match — ${req.winnerName} wins.`
        : 'This ended the match — it is a draw.',
    );
  }
  lines.push('', `Write the ${language} commentary now (max 2 sentences).`);

  return { system, user: lines.join('\n') };
}

/** Models love to over-deliver. Enforce the "max 2 sentences" rule ourselves. */
export function trimToTwoSentences(raw: string): string {
  const text = raw
    .trim()
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/\s+/g, ' ');
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]*/g);
  if (!sentences) return text;
  return sentences.slice(0, 2).join('').trim();
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
  const s = stateBefore as BattleshipState;
  const cell = coordToCell(move as string, s.size);
  if (cell === null) return 'weak';
  return classifyBattleshipShot(battleship.viewFor(s, player), cell);
}

// ---------------------------------------------------------------------------
// Fire-and-forget queue
// ---------------------------------------------------------------------------

export interface CommentatorOptions {
  transport: ChatTransport;
  modelId: string;
  onComment: (c: Commentary) => void;
  /** The language the commentary is written in — the user reads it. */
  locale?: Locale;
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
      const { system, user } = buildCommentaryPrompt(req, opts.locale);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await opts.transport(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          controller.signal,
        );
        const text = trimToTwoSentences(res.text);
        // A late comment still knows which move it was about (§12.1).
        if (text && !stopped) {
          opts.onComment({ moveIndex: req.moveIndex, text, modelId: opts.modelId });
        }
      } catch {
        // The commentator is decoration. A failure must never surface as an error.
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
