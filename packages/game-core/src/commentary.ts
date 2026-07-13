import { type BattleshipState, battleship } from './battleship';
import type { TicTacToeState } from './tictactoe';
import type { GameId, Move, MoveQuality, PlayerSide, TicTacToeCell } from './types';

/**
 * The AI commentator's PROMPT (SPEC §12.1) — pure, deterministic, and shared.
 *
 * It lives in game-core, not in the web app, for one reason: the server-funded
 * "coach" builds this prompt too, and it must build it ITSELF from validated,
 * structured input. If the browser handed the server a ready-made prompt, the
 * coach endpoint would be an open proxy to the owner's Gemini key — anyone could
 * spend it on arbitrary text. Because both sides import this one builder, the
 * endpoint can only ever produce board commentary, and the two paths cannot drift.
 *
 * The commentator gets the GOD VIEW (both fleets). That is legal precisely
 * because it never plays: the "prompt contains only PlayerView" rule (§5) exists
 * to stop a *player* from seeing hidden information, and this is not a player.
 */

/** UI language of the OUTPUT. The instructions stay English either way (§5). */
export type CommentaryLocale = 'pl' | 'en';

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
 * Commenting on every move would be noisy and would cost money for nothing.
 * Comment on what a human commentator would: mistakes, the opening, the finish,
 * and an occasional beat in between.
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
const OUTPUT_LANGUAGE: Record<CommentaryLocale, string> = { pl: 'POLISH', en: 'ENGLISH' };

/**
 * The instructions stay English (SPEC §5: model prompts are English, whatever the
 * UI language) — but the OUTPUT is read by the user, so it follows the INTERFACE
 * language. This is the only prompt in the app that does.
 */
export function buildCommentaryPrompt(
  req: CommentRequest,
  locale: CommentaryLocale = 'pl',
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
