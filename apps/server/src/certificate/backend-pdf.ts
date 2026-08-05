/**
 * Scene → PDF, via `pdf-lib`.
 *
 * The page is VECTOR: the only raster on it is the atmospheric background JPEG.
 * Type, frames, badge, QR and the board are drawn as PDF operators, which is why
 * the file is ~300 kB instead of ~2 MB, stays sharp at any zoom, prints properly
 * on A5, and lets a reader select the nickname and the match id as text.
 *
 * The board is drawn by the SAME code as the OG card (`og/boards.ts`): this file
 * implements that module's tiny `Ctx` interface on top of a `PDFPage`.
 */
import fontkit from '@pdf-lib/fontkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';

import { type Ctx, type TextAlign as CtxAlign, drawBoard } from '../og/boards';
import { FONTS_DIR } from '../og/render';
import { loadArt } from './art';
import type { FontRole, Node, Rgb, Scene, TextNode } from './scene-types';

interface Fonts {
  display: PDFFont;
  mono: PDFFont;
  'mono-bold': PDFFont;
  /** True when the brand TTFs were unavailable and we fell back to base-14. */
  fallback: boolean;
}

const color = (c: Rgb) => rgb(c[0] / 255, c[1] / 255, c[2] / 255);

/**
 * Base-14 fallback fonts are WinAnsi-only, so Polish text would throw on encode.
 * Folding is strictly a last resort — the brand TTFs ship with the bundle and
 * cover Latin Extended-A (asserted by copy.test.ts).
 */
const FOLD: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
  '›': '>', '·': '-', '—': '-', '…': '...',
};

const fold = (s: string): string => s.replace(/[^\x20-\x7E]/g, (ch) => FOLD[ch] ?? '');

async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  const read = (file: string): Buffer | null => {
    const path = join(FONTS_DIR, file);
    return existsSync(path) ? readFileSync(path) : null;
  };
  const rajdhani = read('Rajdhani-Bold.ttf');
  const monoRegular = read('JetBrainsMono-Regular.ttf');
  const monoBold = read('JetBrainsMono-Bold.ttf');
  if (rajdhani && monoRegular && monoBold) {
    try {
      return {
        display: await doc.embedFont(rajdhani, { subset: true }),
        mono: await doc.embedFont(monoRegular, { subset: true }),
        'mono-bold': await doc.embedFont(monoBold, { subset: true }),
        fallback: false,
      };
    } catch {
      // Corrupt TTF — fall through to base-14 rather than failing the request.
    }
  }
  return {
    display: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
    'mono-bold': await doc.embedFont(StandardFonts.CourierBold),
    fallback: true,
  };
}

function widthOf(font: PDFFont, text: string, size: number, tracking: number): number {
  const base = font.widthOfTextAtSize(text, size);
  return tracking === 0 ? base : base + tracking * Math.max(0, text.length - 1);
}

function drawTextNode(page: PDFPage, fonts: Fonts, node: TextNode, height: number): void {
  const font = fonts[node.font as FontRole];
  const tracking = node.tracking ?? 0;
  let text = fonts.fallback ? fold(node.text) : node.text;
  let size = node.size;

  if (node.maxWidth !== undefined) {
    if (node.fit === 'ellipsis') {
      if (widthOf(font, text, size, tracking) > node.maxWidth) {
        let s = text;
        while (s.length > 1 && widthOf(font, `${s}…`, size, tracking) > node.maxWidth) {
          s = s.slice(0, -1);
        }
        text = `${s}…`;
      }
    } else if (node.fit === 'shrink') {
      while (size > 4 && widthOf(font, text, size, tracking) > node.maxWidth) size -= 0.25;
    }
  }

  const width = widthOf(font, text, size, tracking);
  const startX =
    node.align === 'right' ? node.x - width : node.align === 'center' ? node.x - width / 2 : node.x;
  const y = height - node.y;
  const opts = { size, font, color: color(node.color), opacity: node.opacity ?? 1 };

  if (tracking === 0) {
    page.drawText(text, { x: startX, y, ...opts });
    return;
  }
  // Letter-spacing has no pdf-lib option, so place each glyph. Only kickers use
  // it, where the loss of kerning is invisible (and wanted).
  let cursor = startX;
  for (const ch of text) {
    page.drawText(ch, { x: cursor, y, ...opts });
    cursor += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

/** Merge each QR row into horizontal runs — ~4× fewer rectangles in the file. */
function drawQr(
  page: PDFPage,
  modules: readonly (readonly boolean[])[],
  x: number,
  y: number,
  size: number,
  fill: Rgb,
  height: number,
): void {
  const n = modules.length;
  if (n === 0) return;
  const unit = size / n;
  const paint = color(fill);
  for (let r = 0; r < n; r++) {
    const row = modules[r]!;
    let c = 0;
    while (c < n) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      let run = 1;
      while (c + run < n && row[c + run]) run += 1;
      page.drawRectangle({
        x: x + c * unit,
        y: height - (y + (r + 1) * unit),
        width: unit * run,
        height: unit,
        color: paint,
      });
      c += run;
    }
  }
}

// ---------------------------------------------------------------------------
// og/boards.ts `Ctx`, implemented on a PDFPage
// ---------------------------------------------------------------------------

function parseColor(css: string): { rgb: Rgb; alpha: number } {
  if (css.startsWith('#')) {
    return {
      rgb: [
        Number.parseInt(css.slice(1, 3), 16),
        Number.parseInt(css.slice(3, 5), 16),
        Number.parseInt(css.slice(5, 7), 16),
      ],
      alpha: 1,
    };
  }
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return { rgb: [255, 255, 255], alpha: 1 };
  const parts = m[1]!.split(',').map((p) => Number.parseFloat(p.trim()));
  return {
    rgb: [parts[0] ?? 255, parts[1] ?? 255, parts[2] ?? 255],
    alpha: parts[3] ?? 1,
  };
}

/** `bold 20px "JetBrains Mono", monospace` → the embedded face + size. */
function parseFont(css: string, fonts: Fonts): { font: PDFFont; size: number } {
  const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(css)?.[1] ?? '10');
  const bold = css.startsWith('bold');
  const face: FontRole = css.includes('Rajdhani') ? 'display' : bold ? 'mono-bold' : 'mono';
  return { font: fonts[face], size };
}

/**
 * `lineScale` matters: the board drawers were written for a 320 px OG board and
 * hard-code 1–3 px strokes. On a 96 pt certificate thumbnail those would read as
 * fat black bars, so widths are scaled by the size ratio.
 */
function pdfCtx(page: PDFPage, fonts: Fonts, height: number, lineScale: number): Ctx {
  let path: { x: number; y: number }[] = [];
  const ctx = {
    fillStyle: '#ffffff',
    strokeStyle: '#ffffff',
    lineWidth: 1,
    font: '10px "JetBrains Mono", monospace',
    textAlign: 'left' as CtxAlign,
    fillRect(x: number, y: number, w: number, h: number) {
      const { rgb: c, alpha } = parseColor(ctx.fillStyle);
      page.drawRectangle({
        x,
        y: height - (y + h),
        width: w,
        height: h,
        color: color(c),
        opacity: alpha,
      });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      const { rgb: c, alpha } = parseColor(ctx.strokeStyle);
      page.drawRectangle({
        x,
        y: height - (y + h),
        width: w,
        height: h,
        borderColor: color(c),
        borderWidth: ctx.lineWidth * lineScale,
        borderOpacity: alpha,
        opacity: 0,
      });
    },
    fillText(text: string, x: number, y: number) {
      const { font, size } = parseFont(ctx.font, fonts);
      const { rgb: c, alpha } = parseColor(ctx.fillStyle);
      const safe = fonts.fallback ? fold(text) : text;
      const w = font.widthOfTextAtSize(safe, size);
      const start =
        ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? x - w : x;
      page.drawText(safe, { x: start, y: height - y, size, font, color: color(c), opacity: alpha });
    },
    measureText(text: string) {
      const { font, size } = parseFont(ctx.font, fonts);
      return { width: font.widthOfTextAtSize(fonts.fallback ? fold(text) : text, size) };
    },
    beginPath() {
      path = [];
    },
    moveTo(x: number, y: number) {
      path = [{ x, y }];
    },
    lineTo(x: number, y: number) {
      path.push({ x, y });
    },
    stroke() {
      const { rgb: c, alpha } = parseColor(ctx.strokeStyle);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        page.drawLine({
          start: { x: a.x, y: height - a.y },
          end: { x: b.x, y: height - b.y },
          thickness: ctx.lineWidth * lineScale,
          color: color(c),
          opacity: alpha,
        });
      }
    },
  };
  return ctx satisfies Ctx;
}

export interface PdfMeta {
  title: string;
  subject: string;
  keywords: string[];
  /** `YYYY-MM-DD` — the certificate is dated the day it was earned. */
  day: string;
}

export async function renderPdf(scene: Scene, meta: PdfMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = await embedFonts(doc);
  const page = doc.addPage([scene.width, scene.height]);
  const H = scene.height;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: scene.width,
    height: H,
    color: color(scene.background),
  });

  for (const node of scene.nodes) {
    try {
      await drawNode(doc, page, fonts, node, H);
    } catch {
      // One bad node must never cost the whole document (§2.11).
    }
  }

  doc.setTitle(meta.title);
  doc.setAuthor('tic-bot-toe — LLM Game Arena');
  doc.setSubject(meta.subject);
  doc.setKeywords(meta.keywords);
  doc.setProducer('tic-bot-toe');
  doc.setCreator('tic-bot-toe — LLM Game Arena');
  const dated = new Date(`${meta.day}T12:00:00Z`);
  if (!Number.isNaN(dated.getTime())) {
    doc.setCreationDate(dated);
    doc.setModificationDate(dated);
  }

  return doc.save();
}

async function drawNode(
  doc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  node: Node,
  H: number,
): Promise<void> {
  switch (node.kind) {
    case 'image': {
      const bytes = loadArt(node.src);
      if (!bytes) return; // flat background already painted
      const img = await doc.embedJpg(bytes);
      page.drawImage(img, { x: node.x, y: H - (node.y + node.h), width: node.w, height: node.h });
      return;
    }
    case 'rect': {
      page.drawRectangle({
        x: node.x,
        y: H - (node.y + node.h),
        width: node.w,
        height: node.h,
        ...(node.fill ? { color: color(node.fill) } : { opacity: 0 }),
        ...(node.stroke
          ? {
              borderColor: color(node.stroke),
              borderWidth: node.lineWidth ?? 1,
              borderOpacity: node.opacity ?? 1,
            }
          : {}),
        ...(node.fill ? { opacity: node.opacity ?? 1 } : {}),
      });
      return;
    }
    case 'line': {
      page.drawLine({
        start: { x: node.x1, y: H - node.y1 },
        end: { x: node.x2, y: H - node.y2 },
        thickness: node.lineWidth,
        color: color(node.stroke),
        opacity: node.opacity ?? 1,
      });
      return;
    }
    case 'text':
      drawTextNode(page, fonts, node, H);
      return;
    case 'qr':
      drawQr(page, node.modules, node.x, node.y, node.size, node.color, H);
      return;
    case 'board':
      drawBoard(
        pdfCtx(page, fonts, H, node.size / 320),
        node.game,
        node.state,
        node.x,
        node.y,
        node.size,
      );
      return;
  }
}
