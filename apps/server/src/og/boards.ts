/**
 * Final-board drawing, shared by the OG card (§11) and the certificate.
 *
 * Extracted from `render.ts` when the certificate started showing the same
 * board: two copies of "how a finished sudoku looks" would drift, and the
 * certificate's whole point is that it depicts the match it certifies.
 *
 * The `Ctx` interface below is the ONLY thing these functions need — a hand-
 * written subset of CanvasRenderingContext2D. That is deliberate: the PDF
 * backend implements the same 12 methods on `pdf-lib`, so the certificate's
 * board is vector, not a pasted bitmap.
 */
import {
  type BattleshipState,
  type GameId,
  type Move,
  type PlacedTile,
  type PlayerSide,
  type ScrabbleState,
  type SetupRecord,
  type SudokuState,
  type TicTacToeState,
  battleship,
  getGame,
} from '@arena/game-core';

export const P1 = '#35e7ff';
export const P2 = '#ff3d9a';
export const DIM = '#8590ad';
export const GRID = 'rgba(53,231,255,0.16)';

/** Data (model ids, marks, wordmark) — monospace, per DESIGN §2. */
export const mono = (size: number, bold = false): string =>
  `${bold ? 'bold ' : ''}${size}px "JetBrains Mono", monospace`;
/** Chrome (labels, subline) — the display face. */
export const display = (size: number, bold = false): string =>
  `${bold ? 'bold ' : ''}${size}px "Rajdhani", sans-serif`;

export type TextAlign = 'left' | 'right' | 'center' | 'start' | 'end';

export interface Ctx {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: TextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

export interface OgMatch {
  game: GameId;
  variant: string;
  p1Id: string;
  p2Id: string;
  winner: string | null;
  setup: unknown;
  moves: unknown;
}

export function short(id: string): string {
  return id.replace(/^(openrouter|webllm|ollama):/, '');
}

/** Trim `text` (in the ctx's current font) until it fits, appending an ellipsis. */
export function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

function configFromSetup(setup: SetupRecord | null | undefined) {
  if (!setup) return {};
  return {
    seed: typeof setup.seed === 'number' ? setup.seed : undefined,
    extraShotOnHit: typeof setup.extraShotOnHit === 'boolean' ? setup.extraShotOnHit : undefined,
    placements: setup.placements,
  };
}

interface GameDef {
  variants: { id: string; label: string }[];
  createInitialState: (v: { id: string; label: string }, c: unknown) => unknown;
  applyMove: (s: unknown, p: 'p1' | 'p2', m: Move) => unknown;
}

function defAndVariant(match: OgMatch): { def: GameDef; variant: { id: string; label: string } } {
  const def = getGame(match.game) as unknown as GameDef;
  const variant = def.variants.find((v) => v.id === match.variant) ?? {
    id: match.variant,
    label: match.variant,
  };
  return { def, variant };
}

/**
 * The empty board for this game — its pictogram. Used where the real position
 * cannot be reconstructed but the layout still wants the shape of the game.
 */
export function initialState(match: OgMatch): unknown {
  const { def, variant } = defAndVariant(match);
  return def.createInitialState(variant, configFromSetup(match.setup as SetupRecord));
}

/** Reconstruct the final state so the board reflects the actual match. */
export function finalState(match: OgMatch): unknown {
  const { def, variant } = defAndVariant(match);
  let state = def.createInitialState(variant, configFromSetup(match.setup as SetupRecord));
  const moves = Array.isArray(match.moves) ? (match.moves as { player: 'p1' | 'p2'; move: Move }[]) : [];
  for (const m of moves) state = def.applyMove(state, m.player, m.move);
  return state;
}

export function drawTicTacToe(
  ctx: Ctx,
  state: TicTacToeState,
  cx: number,
  cy: number,
  size: number,
): void {
  const cell = size / 3;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 3;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * cell, cy);
    ctx.lineTo(cx + i * cell, cy + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + i * cell);
    ctx.lineTo(cx + size, cy + i * cell);
    ctx.stroke();
  }
  ctx.font = mono(Math.floor(cell * 0.62), true);
  ctx.textAlign = 'center';
  for (let i = 0; i < 9; i++) {
    const mark = state.board[i];
    if (!mark) continue;
    ctx.fillStyle = mark === 'X' ? P1 : P2;
    const col = i % 3;
    const row = Math.floor(i / 3);
    ctx.fillText(mark, cx + col * cell + cell / 2, cy + row * cell + cell * 0.72);
  }
}

export function drawBattleship(
  ctx: Ctx,
  state: BattleshipState,
  cx: number,
  cy: number,
  size: number,
): void {
  const n = state.size;
  const cell = size / n;
  const view = battleship.viewFor(state, 'p1').trackingBoard;
  for (let i = 0; i < n * n; i++) {
    const col = i % n;
    const row = Math.floor(i / n);
    const x = cx + col * cell;
    const y = cy + row * cell;
    const t = view[i];
    ctx.fillStyle =
      t === 'sunk' ? '#ff4d6a' : t === 'hit' ? P2 : t === 'miss' ? '#1a2338' : '#0a1120';
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
  }
}

/** Final sudoku grid: clues neutral, scored digits in the placer's colour, box seams thicker. */
export function drawSudoku(
  ctx: Ctx,
  state: SudokuState,
  cx: number,
  cy: number,
  size: number,
): void {
  const n = state.size;
  const cell = size / n;
  const owners: (PlayerSide | null)[] = Array<PlayerSide | null>(n * n).fill(null);
  for (const h of state.history) if (h.correct) owners[h.cell] = h.player;

  // Grid lines (thicker on box boundaries).
  for (let i = 1; i < n; i++) {
    const thick = i % state.boxCols === 0;
    ctx.strokeStyle = thick ? 'rgba(53,231,255,0.4)' : GRID;
    ctx.lineWidth = thick ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + i * cell, cy);
    ctx.lineTo(cx + i * cell, cy + size);
    ctx.stroke();
  }
  for (let i = 1; i < n; i++) {
    const thick = i % state.boxRows === 0;
    ctx.strokeStyle = thick ? 'rgba(53,231,255,0.4)' : GRID;
    ctx.lineWidth = thick ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + i * cell);
    ctx.lineTo(cx + size, cy + i * cell);
    ctx.stroke();
  }

  ctx.font = mono(Math.floor(cell * 0.56), true);
  ctx.textAlign = 'center';
  for (let i = 0; i < n * n; i++) {
    const digit = state.board[i];
    if (digit === null) continue;
    const owner = owners[i];
    ctx.fillStyle = state.givenMask[i] ? '#c9d3ee' : owner === 'p1' ? P1 : owner === 'p2' ? P2 : DIM;
    const col = i % n;
    const row = Math.floor(i / n);
    ctx.fillText(String(digit), cx + col * cell + cell / 2, cy + row * cell + cell * 0.68);
  }
}

/** Final word-game board: placed tiles as lettered squares. */
export function drawScrabble(
  ctx: Ctx,
  state: ScrabbleState,
  cx: number,
  cy: number,
  size: number,
): void {
  const n = 15;
  const cell = size / n;
  const board = state.board as (PlacedTile | null)[];
  for (let i = 0; i < n * n; i++) {
    const col = i % n;
    const row = Math.floor(i / n);
    const x = cx + col * cell;
    const y = cy + row * cell;
    const t = board[i];
    ctx.fillStyle = t ? (t.isBlank ? '#243049' : '#1b2740') : '#0a1120';
    ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    if (t) {
      ctx.fillStyle = t.isBlank ? P2 : '#dfe7ff';
      ctx.font = mono(Math.floor(cell * 0.6), true);
      ctx.textAlign = 'center';
      ctx.fillText(t.letter, x + cell / 2, y + cell * 0.72);
    }
  }
}

/** Dispatch on the game id — the one place that knows which drawer to call. */
export function drawBoard(
  ctx: Ctx,
  game: GameId,
  state: unknown,
  x: number,
  y: number,
  size: number,
): void {
  if (game === 'tictactoe') {
    drawTicTacToe(ctx, state as TicTacToeState, x, y, size);
  } else if (game === 'sudoku') {
    drawSudoku(ctx, state as SudokuState, x, y, size);
  } else if (game === 'scrabble') {
    drawScrabble(ctx, state as ScrabbleState, x, y, size);
  } else {
    drawBattleship(ctx, state as BattleshipState, x, y, size);
  }
}
