/**
 * OG preview image (SPEC §11): render the final board + title to a 1200×630 PNG
 * with @napi-rs/canvas. Best-effort — any reconstruction failure falls back to a
 * title-only card, never a 500. Native module (can't be bundled) — see tsup
 * `external` + the runtime install in deploy/Dockerfile.
 */
import type { Locale } from '@arena/i18n';

import {
  type BattleshipState,
  type GameId,
  type Move,
  type PlayerSide,
  type SetupRecord,
  type SudokuState,
  type TicTacToeState,
  battleship,
  getGame,
} from '@arena/game-core';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';

const W = 1200;
const H = 630;
const BG = '#05070c';
const P1 = '#35e7ff';
const P2 = '#ff3d9a';
const DIM = '#8590ad';
const GRID = 'rgba(53,231,255,0.16)';

/**
 * Brand fonts (DESIGN §2: Rajdhani for chrome, JetBrains Mono for data).
 * Resolved next to the running module, which covers all three layouts:
 *   dev  → src/og/fonts   ·  built → dist/fonts  ·  docker → /app/fonts
 * Registration is best-effort: if it fails we keep the generic families and the
 * card still renders (SPEC §20.7 — the OG endpoint must never fail).
 */
const FONTS_DIR = process.env.OG_FONTS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'fonts');

let fontsRegistered = false;
function registerBrandFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true; // one attempt only — never retry per request
  const files: [string, string][] = [
    ['Rajdhani-Bold.ttf', 'Rajdhani'],
    ['JetBrainsMono-Regular.ttf', 'JetBrains Mono'],
    ['JetBrainsMono-Bold.ttf', 'JetBrains Mono'],
  ];
  for (const [file, family] of files) {
    const path = join(FONTS_DIR, file);
    if (!existsSync(path)) continue;
    try {
      GlobalFonts.registerFromPath(path, family);
    } catch {
      // Missing/unreadable font → fall back to the generic family below.
    }
  }
}

/** Data (model ids, marks, wordmark) — monospace, per DESIGN §2. */
const mono = (size: number, bold = false): string =>
  `${bold ? 'bold ' : ''}${size}px "JetBrains Mono", monospace`;
/** Chrome (labels, subline) — the display face. */
const display = (size: number, bold = false): string =>
  `${bold ? 'bold ' : ''}${size}px "Rajdhani", sans-serif`;

type TextAlign = 'left' | 'right' | 'center' | 'start' | 'end';

export interface OgMatch {
  game: GameId;
  variant: string;
  p1Id: string;
  p2Id: string;
  winner: string | null;
  setup: unknown;
  moves: unknown;
}

function short(id: string): string {
  return id.replace(/^(openrouter|webllm|ollama):/, '');
}

/** Trim `text` (in the ctx's current font) until it fits, appending an ellipsis. */
function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
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

interface Ctx {
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

/** Reconstruct the final state so the board reflects the actual match. */
function finalState(match: OgMatch): unknown {
  const def = getGame(match.game) as unknown as {
    variants: { id: string; label: string }[];
    createInitialState: (v: { id: string; label: string }, c: unknown) => unknown;
    applyMove: (s: unknown, p: 'p1' | 'p2', m: Move) => unknown;
  };
  const variantObj = def.variants.find((v) => v.id === match.variant) ?? {
    id: match.variant,
    label: match.variant,
  };
  let state = def.createInitialState(variantObj, configFromSetup(match.setup as SetupRecord));
  const moves = Array.isArray(match.moves) ? (match.moves as { player: 'p1' | 'p2'; move: Move }[]) : [];
  for (const m of moves) state = def.applyMove(state, m.player, m.move);
  return state;
}

function drawTicTacToe(ctx: Ctx, state: TicTacToeState, cx: number, cy: number, size: number): void {
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

function drawBattleship(ctx: Ctx, state: BattleshipState, cx: number, cy: number, size: number): void {
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
function drawSudoku(ctx: Ctx, state: SudokuState, cx: number, cy: number, size: number): void {
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

/** The only words on the card — the rest is the board and the model ids. */
const CARD_COPY: Record<Locale, { game: (g: GameId) => string; draw: string; wins: (w: string) => string; fallback: string }> = {
  pl: {
    game: (g) => (g === 'tictactoe' ? 'Kółko i krzyżyk' : g === 'sudoku' ? 'Sudoku Duel' : 'Statki'),
    draw: 'remis',
    wins: (w) => `${w} wygrywa`,
    fallback: 'partia',
  },
  en: {
    game: (g) => (g === 'tictactoe' ? 'Tic-tac-toe' : g === 'sudoku' ? 'Sudoku Duel' : 'Battleship'),
    draw: 'draw',
    wins: (w) => `${w} wins`,
    fallback: 'match',
  },
};

export function renderMatchOg(match: OgMatch, locale: Locale = 'pl'): Buffer {
  registerBrandFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as Ctx;

  // Background + subtle grid.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(53,231,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const p1 = short(match.p1Id);
  const p2 = short(match.p2Id);

  // Title: "p1  vs  p2" with player colors, laid out by measured widths.
  // Title: "p1 vs p2". Model ids get long ("anthropic/claude-sonnet-4") and mono
  // is wide, so shrink to fit first and only then ellipsize — never bleed off card.
  ctx.textAlign = 'left';
  const pad = 64;
  const GAP = 24;
  const maxTitle = W - pad * 2;
  const vsSize = (s: number): number => Math.round(s * 0.8);
  const titleWidth = (s: number, a: string, b: string): number => {
    ctx.font = mono(s, true);
    const names = ctx.measureText(a).width + ctx.measureText(b).width;
    ctx.font = display(vsSize(s), true);
    return names + ctx.measureText('vs').width + GAP * 2;
  };

  let size = 52;
  while (size > 28 && titleWidth(size, p1, p2) > maxTitle) size -= 2;

  let n1 = p1;
  let n2 = p2;
  if (titleWidth(size, n1, n2) > maxTitle) {
    ctx.font = display(vsSize(size), true);
    const room = (maxTitle - ctx.measureText('vs').width - GAP * 2) / 2;
    ctx.font = mono(size, true);
    n1 = ellipsize(ctx, n1, room);
    n2 = ellipsize(ctx, n2, room);
  }

  ctx.font = mono(size, true);
  const n1w = ctx.measureText(n1).width;
  ctx.fillStyle = P1;
  ctx.fillText(n1, pad, 120);
  ctx.fillStyle = DIM;
  ctx.font = display(vsSize(size), true);
  const vsX = pad + n1w + GAP;
  ctx.fillText('vs', vsX, 116);
  const vsW = ctx.measureText('vs').width;
  ctx.fillStyle = P2;
  ctx.font = mono(size, true);
  ctx.fillText(n2, vsX + vsW + GAP, 120);

  // Subline: game · variant · result.
  const copy = CARD_COPY[locale];
  const gameLabel = copy.game(match.game);
  const result =
    match.winner === 'draw'
      ? copy.draw
      : match.winner === 'p1'
        ? copy.wins(p1)
        : match.winner === 'p2'
          ? copy.wins(p2)
          : copy.fallback;
  ctx.fillStyle = DIM;
  ctx.font = display(32, true);
  ctx.fillText(ellipsize(ctx, `${gameLabel} · ${match.variant} · ${result}`, maxTitle), pad, 175);

  // Final board, centred lower area.
  try {
    const state = finalState(match);
    // Sized so the framed board clears the footer wordmark at the bottom.
    const boardSize = 320;
    const bx = (W - boardSize) / 2;
    const by = 222;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 10, by - 10, boardSize + 20, boardSize + 20);
    if (match.game === 'tictactoe') {
      drawTicTacToe(ctx, state as TicTacToeState, bx, by, boardSize);
    } else if (match.game === 'sudoku') {
      drawSudoku(ctx, state as SudokuState, bx, by, boardSize);
    } else {
      drawBattleship(ctx, state as BattleshipState, bx, by, boardSize);
    }
  } catch {
    // Title-only fallback — never fail the request.
  }

  // Footer wordmark.
  ctx.fillStyle = DIM;
  ctx.font = mono(24, true);
  ctx.textAlign = 'right';
  ctx.fillText('tic-bot-toe · LLM Game Arena', W - pad, H - 28);

  return canvas.toBuffer('image/png');
}
