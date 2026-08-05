/**
 * OG preview image (SPEC §11): render the final board + title to a 1200×630 PNG
 * with @napi-rs/canvas. Best-effort — any reconstruction failure falls back to a
 * title-only card, never a 500. Native module (can't be bundled) — see tsup
 * `external` + the runtime install in deploy/Dockerfile.
 */
import type { Locale } from '@arena/i18n';

import type { GameId } from '@arena/game-core';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';

import {
  type Ctx,
  type OgMatch,
  DIM,
  GRID,
  P1,
  P2,
  display,
  drawBoard,
  ellipsize,
  finalState,
  mono,
  short,
} from './boards';

export type { OgMatch };

const W = 1200;
const H = 630;
const BG = '#05070c';

/**
 * Brand fonts (DESIGN §2: Rajdhani for chrome, JetBrains Mono for data).
 * Resolved next to the running module, which covers all three layouts:
 *   dev  → src/og/fonts   ·  built → dist/fonts  ·  docker → /app/fonts
 * Registration is best-effort: if it fails we keep the generic families and the
 * card still renders (SPEC §20.7 — the OG endpoint must never fail).
 */
export const FONTS_DIR = process.env.OG_FONTS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'fonts');

let fontsRegistered = false;
export function registerBrandFonts(): void {
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

/** The only words on the card — the rest is the board and the model ids. */
const CARD_COPY: Record<Locale, { game: (g: GameId) => string; draw: string; wins: (w: string) => string; fallback: string }> = {
  pl: {
    game: (g) =>
      g === 'tictactoe' ? 'Kółko i krzyżyk' : g === 'sudoku' ? 'Sudoku Duel' : g === 'scrabble' ? 'Słowna bitwa' : 'Statki',
    draw: 'remis',
    wins: (w) => `${w} wygrywa`,
    fallback: 'partia',
  },
  en: {
    game: (g) =>
      g === 'tictactoe' ? 'Tic-tac-toe' : g === 'sudoku' ? 'Sudoku Duel' : g === 'scrabble' ? 'Word Battle' : 'Battleship',
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
    drawBoard(ctx, match.game, state, bx, by, boardSize);
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
