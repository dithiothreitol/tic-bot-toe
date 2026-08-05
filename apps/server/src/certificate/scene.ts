/**
 * Layout — the certificate compiled to a backend-agnostic display list.
 *
 * Two scenes, one vocabulary:
 *   `certificateScene` → A5 LANDSCAPE (595.28 × 419.53 pt), the printable PDF.
 *   `shareCardScene`   → 1200 × 630 px, the social preview.
 *
 * They are deliberately NOT the same composition scaled: A5 is 1.42:1 and an OG
 * card is 1.91:1, so reusing one would either letterbox the document or crop its
 * corners off. The share card shows the certificate as an object and pulls the
 * facts out next to it, sized to survive a thumbnail in a feed.
 *
 * Typographic hierarchy on the A5 is intentionally "diploma": the name is huge,
 * the verifiable data is the smallest thing on the page. That is how real course
 * certificates are set — except here the fine print is the only part that holds
 * up, which is the entire point (plan §6.0).
 */
import qrcode from 'qrcode-generator';

import type { Locale } from '@arena/i18n';

import { CERTIFICATE_COPY } from './copy';
import type { CertificateFacts } from './facts';
import { shortMatchId } from './facts';
import {
  type LineNode,
  type Node,
  type Rgb,
  type Scene,
  PALETTE,
} from './scene-types';
import { tierFor } from './tiers';

// ---------------------------------------------------------------------------
// A5 landscape geometry (points; 1 pt = 1/72")
// ---------------------------------------------------------------------------

/** 210 mm × 148 mm. */
export const A5 = { width: 595.28, height: 419.53 } as const;

/**
 * Home printers cannot print to the paper edge, so NOTHING but the background
 * crosses this margin. The frame sits inside it, the content inside the frame.
 */
const FRAME = { x: 24, y: 20, w: 547.28, h: 378 } as const;
const CONTENT_X = FRAME.x + 20; // 44
const CONTENT_R = FRAME.x + FRAME.w - 20; // 551.28

const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: Rgb,
  lineWidth: number,
  opacity?: number,
): LineNode => ({ kind: 'line', x1, y1, x2, y2, stroke, lineWidth, opacity });

/** Rectangle with cut (chamfered) corners — the vector form of the app's `clip-cut`. */
function cutFrame(
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
  stroke: Rgb,
  lineWidth: number,
  opacity?: number,
): LineNode[] {
  const x2 = x + w;
  const y2 = y + h;
  return [
    line(x + cut, y, x2 - cut, y, stroke, lineWidth, opacity),
    line(x2 - cut, y, x2, y + cut, stroke, lineWidth, opacity),
    line(x2, y + cut, x2, y2 - cut, stroke, lineWidth, opacity),
    line(x2, y2 - cut, x2 - cut, y2, stroke, lineWidth, opacity),
    line(x2 - cut, y2, x + cut, y2, stroke, lineWidth, opacity),
    line(x + cut, y2, x, y2 - cut, stroke, lineWidth, opacity),
    line(x, y2 - cut, x, y + cut, stroke, lineWidth, opacity),
    line(x, y + cut, x + cut, y, stroke, lineWidth, opacity),
  ];
}

/** L-shaped HUD brackets just outside the frame — the app's signature device. */
function cornerBrackets(
  x: number,
  y: number,
  w: number,
  h: number,
  len: number,
  stroke: Rgb,
  lineWidth: number,
): LineNode[] {
  const x2 = x + w;
  const y2 = y + h;
  return [
    line(x, y, x + len, y, stroke, lineWidth),
    line(x, y, x, y + len, stroke, lineWidth),
    line(x2 - len, y, x2, y, stroke, lineWidth),
    line(x2, y, x2, y + len, stroke, lineWidth),
    line(x, y2 - len, x, y2, stroke, lineWidth),
    line(x, y2, x + len, y2, stroke, lineWidth),
    line(x2 - len, y2, x2, y2, stroke, lineWidth),
    line(x2, y2 - len, x2, y2, stroke, lineWidth),
  ];
}

/**
 * QR module matrix for the certificate URL. Best-effort: an encoder failure
 * (absurdly long origin) drops the QR and keeps the printed URL next to it.
 */
export function qrModules(text: string): boolean[][] {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const rows: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      rows.push(row);
    }
    return rows;
  } catch {
    return [];
  }
}

/** Variants like `standard` add nothing to the label — drop them. */
const variantLabel = (variant: string): string | null =>
  variant === 'standard' ? null : variant;

export interface SceneOptions {
  /** Absolute URL of the certificate page (printed and encoded in the QR). */
  verifyUrl: string;
}

// ---------------------------------------------------------------------------
// The certificate itself
// ---------------------------------------------------------------------------

export function certificateScene(
  facts: CertificateFacts,
  locale: Locale,
  opts: SceneOptions,
): Scene {
  const t = CERTIFICATE_COPY[locale];
  const tier = tierFor(facts.streak);
  const accent = tier.color;
  const nodes: Node[] = [];

  nodes.push({ kind: 'image', src: 'certificate-bg', x: 0, y: 0, w: A5.width, h: A5.height });
  // Scrim. The generated art has bright corner glow, and 6.5 pt fine print laid
  // straight over it is unreadable — which is exactly the text that must be
  // readable, since it carries the verification. Dimming the whole page keeps
  // the artwork visible and makes contrast independent of which background
  // variant ships.
  nodes.push({ kind: 'rect', x: 0, y: 0, w: A5.width, h: A5.height, fill: PALETTE.bg, opacity: 0.42 });

  // Frame: a heavy tier-coloured chamfered rule with a hairline inside it.
  nodes.push(...cutFrame(FRAME.x, FRAME.y, FRAME.w, FRAME.h, 14, accent, 1.2, 0.9));
  nodes.push(...cutFrame(FRAME.x + 4, FRAME.y + 4, FRAME.w - 8, FRAME.h - 8, 11, PALETTE.dim, 0.4, 0.5));
  nodes.push(...cornerBrackets(FRAME.x - 6, FRAME.y - 6, FRAME.w + 12, FRAME.h + 12, 22, accent, 1));

  // --- Header -------------------------------------------------------------
  nodes.push({
    kind: 'text',
    text: t.kicker,
    x: CONTENT_X,
    y: 44,
    size: 7.5,
    font: 'mono',
    color: PALETTE.dim,
    tracking: 1.6,
  });
  nodes.push({
    kind: 'text',
    text: t.title,
    x: CONTENT_X,
    y: 76,
    size: 21,
    font: 'display',
    color: PALETTE.text,
    tracking: 1.1,
    maxWidth: CONTENT_R - CONTENT_X,
    fit: 'shrink',
  });
  nodes.push({
    kind: 'text',
    text: t.subtitle,
    x: CONTENT_X,
    y: 90,
    size: 9,
    font: 'display',
    color: PALETTE.dim,
    tracking: 0.6,
  });
  nodes.push(line(CONTENT_X, 98, CONTENT_X + 300, 98, accent, 0.8, 0.85));

  // --- The award ----------------------------------------------------------
  nodes.push({
    kind: 'text',
    text: t.formula,
    x: CONTENT_X,
    y: 118,
    size: 8,
    font: 'display',
    color: PALETTE.dim,
    maxWidth: CONTENT_R - CONTENT_X,
    fit: 'shrink',
  });
  nodes.push({
    kind: 'text',
    text: facts.playerName ?? t.anonymous,
    x: CONTENT_X,
    y: 154,
    size: 32,
    font: 'display',
    color: PALETTE.p1,
    maxWidth: 400,
    fit: 'shrink',
  });
  if (facts.playerName === null) {
    nodes.push({
      kind: 'text',
      text: t.anonymousHint,
      x: CONTENT_X,
      y: 166,
      size: 6.5,
      font: 'display',
      color: PALETTE.faint,
      maxWidth: 400,
      fit: 'shrink',
    });
  }
  nodes.push({
    kind: 'text',
    text: t.lead,
    x: CONTENT_X,
    y: 178,
    size: 8,
    font: 'display',
    color: PALETTE.dim,
    maxWidth: CONTENT_R - CONTENT_X,
    fit: 'shrink',
  });
  nodes.push({
    kind: 'text',
    text: facts.opponentLabel,
    x: CONTENT_X,
    y: 199,
    size: 14,
    font: 'mono-bold',
    color: PALETTE.p2,
    maxWidth: 390,
    fit: 'shrink',
  });
  nodes.push({
    kind: 'text',
    text: t.condition,
    x: CONTENT_X,
    y: 212,
    size: 7.5,
    font: 'display',
    color: PALETTE.dim,
    tracking: 0.3,
    maxWidth: CONTENT_R - CONTENT_X,
    fit: 'shrink',
  });

  // --- "Learning outcomes" ------------------------------------------------
  nodes.push({
    kind: 'text',
    text: t.outcomesHeader,
    x: CONTENT_X,
    y: 238,
    size: 7,
    font: 'mono',
    color: accent,
    tracking: 1.4,
  });
  const outcomes = [
    t.outcomeGame(t.game(facts.game), variantLabel(facts.variant)),
    t.outcomeMoves(facts.moveCount),
    facts.streak >= 2 ? t.outcomeStreak(facts.streak) : t.outcomeSolo,
  ];
  outcomes.forEach((text, i) => {
    nodes.push({
      kind: 'text',
      text: `› ${text}`,
      x: CONTENT_X,
      y: 253 + i * 14,
      size: 8.5,
      font: 'display',
      color: PALETTE.text,
      maxWidth: 385,
      fit: 'ellipsis',
    });
  });

  t.duration.forEach((text, i) => {
    nodes.push({
      kind: 'text',
      text,
      x: CONTENT_X,
      y: 303 + i * 11,
      size: 7.5,
      font: 'display',
      color: PALETTE.dim,
      maxWidth: 385,
      fit: 'shrink',
    });
  });

  // --- The board actually played ------------------------------------------
  if (facts.final !== null) {
    nodes.push({
      kind: 'rect',
      x: 447,
      y: 224,
      w: 104,
      h: 104,
      stroke: PALETTE.dim,
      lineWidth: 0.5,
      opacity: 0.6,
    });
    nodes.push({ kind: 'board', game: facts.game, state: facts.final, x: 451, y: 228, size: 96 });
  }

  // --- Rank badge (streak ≥ 2 only) + date + signature --------------------
  if (tier.title) {
    nodes.push({
      kind: 'rect',
      x: CONTENT_X,
      y: 326,
      w: 280,
      h: 20,
      fill: accent,
      opacity: 0.1,
    });
    nodes.push(...cutFrame(CONTENT_X, 326, 280, 20, 5, accent, 0.8, 0.9));
    nodes.push({ kind: 'rect', x: CONTENT_X + 7, y: 333, w: 4, h: 4, fill: accent });
    nodes.push({
      kind: 'text',
      text: `${tier.title[locale]} · ${t.streakBadge(facts.streak)}`,
      x: CONTENT_X + 17,
      y: 340,
      size: 9,
      font: 'mono-bold',
      color: accent,
      maxWidth: 250,
      fit: 'shrink',
    });
  }
  nodes.push({
    kind: 'text',
    text: t.date(facts.day),
    x: CONTENT_R,
    y: 340,
    size: 9,
    font: 'mono',
    color: PALETTE.text,
    align: 'right',
  });
  nodes.push({
    kind: 'text',
    text: t.signature,
    x: CONTENT_R,
    y: 350,
    size: 8,
    font: 'display',
    color: PALETTE.dim,
    align: 'right',
    maxWidth: 240,
    fit: 'shrink',
  });

  // --- Verification + fine print -----------------------------------------
  const modules = qrModules(opts.verifyUrl);
  const textLeft = modules.length > 0 ? CONTENT_X + 56 : CONTENT_X;
  if (modules.length > 0) {
    // Light plate + dark modules + a quiet zone. Inverted (light-on-dark) codes
    // look better on this document but are not reliably scanned by every phone,
    // and a QR that only sometimes works is worse than no QR at all.
    nodes.push({ kind: 'rect', x: CONTENT_X - 5, y: 351, w: 50, h: 50, fill: PALETTE.text });
    nodes.push({ kind: 'qr', modules, x: CONTENT_X, y: 356, size: 40, color: PALETTE.bg });
  }
  nodes.push({
    kind: 'text',
    text: t.verify(opts.verifyUrl.replace(/^https?:\/\//, '')),
    x: textLeft,
    y: 366,
    size: 7,
    font: 'mono',
    color: accent,
    maxWidth: CONTENT_R - textLeft,
    fit: 'ellipsis',
  });
  t.disclaimer.forEach((text, i) => {
    nodes.push({
      kind: 'text',
      text,
      x: textLeft,
      y: 376 + i * 8,
      size: 6.5,
      font: 'display',
      color: PALETTE.dim,
      maxWidth: CONTENT_R - textLeft,
      fit: 'ellipsis',
    });
  });

  // --- Outside the frame: the seal ---------------------------------------
  nodes.push({
    kind: 'text',
    text: t.wordmark,
    x: FRAME.x,
    y: 412,
    size: 6.5,
    font: 'mono',
    color: PALETTE.dim,
  });
  nodes.push({
    kind: 'text',
    text: t.seal(shortMatchId(facts.matchId), facts.movesHashPrefix),
    x: FRAME.x + FRAME.w,
    y: 412,
    size: 6.5,
    font: 'mono',
    color: PALETTE.dim,
    align: 'right',
  });

  return { width: A5.width, height: A5.height, background: PALETTE.bg, nodes };
}

// ---------------------------------------------------------------------------
// Social card
// ---------------------------------------------------------------------------

export const SHARE = { width: 1200, height: 630 } as const;

/**
 * Everything load-bearing lives inside this box. Discord, Slack and X show the
 * full 1.91:1, but several mobile clients crop toward a square — the name and
 * the rank have to survive that, which is why they are not near an edge.
 */
export const SHARE_SAFE = { x: 60, y: 80, w: 1080, h: 470 } as const;

export function shareCardScene(
  facts: CertificateFacts,
  locale: Locale,
  _opts: SceneOptions,
): Scene {
  const t = CERTIFICATE_COPY[locale];
  const tier = tierFor(facts.streak);
  const accent = tier.color;
  const nodes: Node[] = [];

  nodes.push({
    kind: 'image',
    src: 'certificate-share',
    x: 0,
    y: 0,
    w: SHARE.width,
    h: SHARE.height,
  });

  nodes.push({
    kind: 'text',
    text: t.shareKicker,
    x: 60,
    y: 84,
    size: 22,
    font: 'mono-bold',
    color: accent,
    tracking: 3,
  });

  nodes.push({
    kind: 'text',
    text: facts.playerName ?? t.anonymous,
    x: 60,
    y: 168,
    size: 60,
    font: 'display',
    color: PALETTE.p1,
    maxWidth: 640,
    fit: 'shrink',
  });

  // The punchline goes HIGH and LARGE here, unlike on the document, where it is
  // fine print: a feed gives the reader about a second and a half.
  t.shareHeadline.forEach((text, i) => {
    nodes.push({
      kind: 'text',
      text,
      x: 60,
      y: 208 + i * 34,
      size: 30,
      font: 'display',
      color: PALETTE.text,
      maxWidth: 660,
      fit: 'shrink',
    });
  });

  nodes.push({
    kind: 'text',
    text: t.shareFacts(
      facts.opponentLabel,
      t.game(facts.game),
      variantLabel(facts.variant),
      facts.moveCount,
    ),
    x: 60,
    y: 340,
    size: 19,
    font: 'mono',
    color: PALETTE.dim,
    maxWidth: 680,
    // Shrink, never ellipsise: a long model id would otherwise eat the move
    // count off the end, and the move count is the claim being made.
    fit: 'shrink',
  });

  if (tier.title) {
    nodes.push({ kind: 'rect', x: 60, y: 366, w: 620, h: 44, fill: accent, opacity: 0.12 });
    nodes.push(...cutFrame(60, 366, 620, 44, 10, accent, 1.4, 0.9));
    nodes.push({ kind: 'rect', x: 78, y: 384, w: 8, h: 8, fill: accent });
    nodes.push({
      kind: 'text',
      text: `${tier.title[locale]} · ${t.streakBadge(facts.streak)}`,
      x: 98,
      y: 396,
      size: 24,
      font: 'mono-bold',
      color: accent,
      maxWidth: 560,
      fit: 'shrink',
    });
  }

  nodes.push({
    kind: 'text',
    text: t.shareBottom(facts.moveCount),
    x: 60,
    y: 466,
    size: 20,
    font: 'mono',
    color: PALETTE.faint,
    maxWidth: 660,
    fit: 'ellipsis',
  });

  // The document, as an object: a mini A5 with its frame, ruled text lines and
  // the real board. Reads as "a certificate" at thumbnail size, where actual
  // words would not.
  const doc = { x: 762, y: 150, w: 380, h: 268 };
  nodes.push({ kind: 'rect', ...doc, fill: PALETTE.panel, opacity: 0.92 });
  nodes.push(...cutFrame(doc.x, doc.y, doc.w, doc.h, 12, accent, 2, 0.95));
  nodes.push(...cutFrame(doc.x + 8, doc.y + 8, doc.w - 16, doc.h - 16, 9, PALETTE.dim, 0.8, 0.5));
  const ruleWidths = [150, 236, 120, 200, 176];
  ruleWidths.forEach((w, i) => {
    nodes.push(line(doc.x + 24, doc.y + 44 + i * 20, doc.x + 24 + w, doc.y + 44 + i * 20, PALETTE.dim, i === 1 ? 5 : 3, i === 1 ? 0.85 : 0.45));
  });
  if (facts.final !== null) {
    nodes.push({
      kind: 'board',
      game: facts.game,
      state: facts.final,
      x: doc.x + 258,
      y: doc.y + 150,
      size: 96,
    });
  }
  nodes.push(line(doc.x + 24, doc.y + 224, doc.x + 140, doc.y + 224, accent, 4, 0.9));

  nodes.push({
    kind: 'text',
    text: t.wordmark,
    x: 60,
    y: 566,
    size: 20,
    font: 'mono',
    color: PALETTE.dim,
  });
  nodes.push({
    kind: 'text',
    text: 'ticbottoe.lol',
    x: 1140,
    y: 566,
    size: 20,
    font: 'mono',
    color: PALETTE.dim,
    align: 'right',
  });

  return { width: SHARE.width, height: SHARE.height, background: PALETTE.bg, nodes };
}
