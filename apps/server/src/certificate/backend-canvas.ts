/**
 * Scene → raster, via `@napi-rs/canvas`. Drives the social share card.
 *
 * Same display list as the PDF backend, so the card cannot claim something the
 * document does not. Output is JPEG: the background is photographic, and a
 * crawler fetching a 250 kB card renders a preview faster than one fetching a
 * 1.5 MB PNG of the same picture.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';

import { type Ctx, drawBoard } from '../og/boards';
import { registerBrandFonts } from '../og/render';
import { loadArt } from './art';
import type { FontRole, Node, Rgb, Scene, TextNode } from './scene-types';

const css = (c: Rgb, alpha = 1): string =>
  alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

const fontCss = (role: FontRole, size: number): string =>
  role === 'display'
    ? `bold ${size}px "Rajdhani", sans-serif`
    : `${role === 'mono-bold' ? 'bold ' : ''}${size}px "JetBrains Mono", monospace`;

function measure(ctx: Ctx, text: string, tracking: number): number {
  const base = ctx.measureText(text).width;
  return tracking === 0 ? base : base + tracking * Math.max(0, text.length - 1);
}

function drawTextNode(ctx: Ctx, node: TextNode): void {
  const tracking = node.tracking ?? 0;
  let size = node.size;
  let text = node.text;
  ctx.font = fontCss(node.font, size);

  if (node.maxWidth !== undefined) {
    if (node.fit === 'ellipsis') {
      if (measure(ctx, text, tracking) > node.maxWidth) {
        let s = text;
        while (s.length > 1 && measure(ctx, `${s}…`, tracking) > node.maxWidth) s = s.slice(0, -1);
        text = `${s}…`;
      }
    } else if (node.fit === 'shrink') {
      while (size > 4 && measure(ctx, text, tracking) > node.maxWidth) {
        size -= 0.25;
        ctx.font = fontCss(node.font, size);
      }
    }
  }

  ctx.fillStyle = css(node.color, node.opacity ?? 1);
  ctx.textAlign = 'left';
  const width = measure(ctx, text, tracking);
  const startX =
    node.align === 'right' ? node.x - width : node.align === 'center' ? node.x - width / 2 : node.x;

  if (tracking === 0) {
    ctx.fillText(text, startX, node.y);
    return;
  }
  let cursor = startX;
  for (const ch of text) {
    ctx.fillText(ch, cursor, node.y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}

/**
 * The board drawers hard-code 1–3 px strokes for a 320 px OG board; at 96 px
 * those read as bars. This wrapper scales every width they set.
 *
 * Explicitly delegating, NOT a Proxy: @napi-rs/canvas methods unwrap the native
 * object from `this`, and a Proxy is not that object — every call throws, which
 * silently cost us the whole board thumbnail the first time round.
 */
function scaledCtx(ctx: Ctx, lineScale: number): Ctx {
  return {
    get fillStyle() {
      return ctx.fillStyle;
    },
    set fillStyle(v: string) {
      ctx.fillStyle = v;
    },
    get strokeStyle() {
      return ctx.strokeStyle;
    },
    set strokeStyle(v: string) {
      ctx.strokeStyle = v;
    },
    get lineWidth() {
      return ctx.lineWidth;
    },
    set lineWidth(v: number) {
      ctx.lineWidth = v * lineScale;
    },
    get font() {
      return ctx.font;
    },
    set font(v: string) {
      ctx.font = v;
    },
    get textAlign() {
      return ctx.textAlign;
    },
    set textAlign(v) {
      ctx.textAlign = v;
    },
    fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    strokeRect: (x, y, w, h) => ctx.strokeRect(x, y, w, h),
    fillText: (t, x, y) => ctx.fillText(t, x, y),
    measureText: (t) => ctx.measureText(t),
    beginPath: () => ctx.beginPath(),
    moveTo: (x, y) => ctx.moveTo(x, y),
    lineTo: (x, y) => ctx.lineTo(x, y),
    stroke: () => ctx.stroke(),
  };
}

export interface RasterOptions {
  /** Device-pixel multiplier — 1 for the OG card, higher for print previews. */
  scale?: number;
  /** JPEG quality, 1–100. */
  quality?: number;
}

async function paint(scene: Scene, scale: number) {
  registerBrandFonts();
  const canvas = createCanvas(Math.round(scene.width * scale), Math.round(scene.height * scale));
  const raw = canvas.getContext('2d');
  raw.scale(scale, scale);
  const ctx = raw as unknown as Ctx;

  ctx.fillStyle = css(scene.background);
  ctx.fillRect(0, 0, scene.width, scene.height);

  for (const node of scene.nodes) {
    try {
      await drawNode(raw, ctx, node);
    } catch {
      // Never let one node cost the card (§2.11).
    }
  }
  return canvas;
}

async function drawNode(
  raw: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  ctx: Ctx,
  node: Node,
): Promise<void> {
  switch (node.kind) {
    case 'image': {
      const bytes = loadArt(node.src);
      if (!bytes) return;
      raw.drawImage(await loadImage(bytes), node.x, node.y, node.w, node.h);
      return;
    }
    case 'rect': {
      if (node.fill) {
        ctx.fillStyle = css(node.fill, node.opacity ?? 1);
        ctx.fillRect(node.x, node.y, node.w, node.h);
      }
      if (node.stroke) {
        ctx.strokeStyle = css(node.stroke, node.opacity ?? 1);
        ctx.lineWidth = node.lineWidth ?? 1;
        ctx.strokeRect(node.x, node.y, node.w, node.h);
      }
      return;
    }
    case 'line': {
      ctx.strokeStyle = css(node.stroke, node.opacity ?? 1);
      ctx.lineWidth = node.lineWidth;
      ctx.beginPath();
      ctx.moveTo(node.x1, node.y1);
      ctx.lineTo(node.x2, node.y2);
      ctx.stroke();
      return;
    }
    case 'text':
      drawTextNode(ctx, node);
      return;
    case 'qr': {
      const n = node.modules.length;
      if (n === 0) return;
      const unit = node.size / n;
      ctx.fillStyle = css(node.color);
      for (let r = 0; r < n; r++) {
        const row = node.modules[r]!;
        let c = 0;
        while (c < n) {
          if (!row[c]) {
            c += 1;
            continue;
          }
          let run = 1;
          while (c + run < n && row[c + run]) run += 1;
          ctx.fillRect(node.x + c * unit, node.y + r * unit, unit * run, unit);
          c += run;
        }
      }
      return;
    }
    case 'board':
      drawBoard(scaledCtx(ctx, node.size / 320), node.game, node.state, node.x, node.y, node.size);
      return;
  }
}

export async function renderJpeg(scene: Scene, opts: RasterOptions = {}): Promise<Buffer> {
  const canvas = await paint(scene, opts.scale ?? 1);
  return canvas.toBuffer('image/jpeg', opts.quality ?? 86);
}

export async function renderPng(scene: Scene, opts: RasterOptions = {}): Promise<Buffer> {
  const canvas = await paint(scene, opts.scale ?? 1);
  return canvas.toBuffer('image/png');
}
