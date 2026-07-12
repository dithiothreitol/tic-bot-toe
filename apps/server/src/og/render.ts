/**
 * OG preview image (SPEC §11): render the final board + title to a 1200×630 PNG
 * with @napi-rs/canvas. Best-effort — any reconstruction failure falls back to a
 * title-only card, never a 500. Native module (can't be bundled) — see tsup
 * `external` + the runtime install in deploy/Dockerfile.
 */
import {
  type BattleshipState,
  type GameId,
  type Move,
  type SetupRecord,
  type TicTacToeState,
  battleship,
  getGame,
} from '@arena/game-core';
import { createCanvas } from '@napi-rs/canvas';

const W = 1200;
const H = 630;
const BG = '#05070c';
const P1 = '#35e7ff';
const P2 = '#ff3d9a';
const DIM = '#6e7b9e';
const GRID = 'rgba(53,231,255,0.16)';

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
  ctx.font = `bold ${Math.floor(cell * 0.62)}px sans-serif`;
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

export function renderMatchOg(match: OgMatch): Buffer {
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
  ctx.textAlign = 'left';
  const pad = 64;
  ctx.font = 'bold 60px sans-serif';
  const p1w = ctx.measureText(p1).width;
  ctx.fillStyle = P1;
  ctx.fillText(p1, pad, 120);
  ctx.fillStyle = DIM;
  ctx.font = '40px sans-serif';
  const vsX = pad + p1w + 28;
  ctx.fillText('vs', vsX, 116);
  const vsW = ctx.measureText('vs').width;
  ctx.fillStyle = P2;
  ctx.font = 'bold 60px sans-serif';
  ctx.fillText(p2, vsX + vsW + 28, 120);

  // Subline: game · variant · result.
  const gameLabel = match.game === 'tictactoe' ? 'Kółko i krzyżyk' : 'Statki';
  const result =
    match.winner === 'draw'
      ? 'remis'
      : match.winner === 'p1'
        ? `${p1} wygrywa`
        : match.winner === 'p2'
          ? `${p2} wygrywa`
          : 'partia';
  ctx.fillStyle = DIM;
  ctx.font = '30px sans-serif';
  ctx.fillText(`${gameLabel} · ${match.variant} · ${result}`, pad, 175);

  // Final board, centred lower area.
  try {
    const state = finalState(match);
    const boardSize = 360;
    const bx = (W - boardSize) / 2;
    const by = 230;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 10, by - 10, boardSize + 20, boardSize + 20);
    if (match.game === 'tictactoe') {
      drawTicTacToe(ctx, state as TicTacToeState, bx, by, boardSize);
    } else {
      drawBattleship(ctx, state as BattleshipState, bx, by, boardSize);
    }
  } catch {
    // Title-only fallback — never fail the request.
  }

  // Footer wordmark.
  ctx.fillStyle = DIM;
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('tic-bot-toe · LLM Game Arena', W - pad, H - 40);

  return canvas.toBuffer('image/png');
}
