/**
 * The display list a certificate is compiled to — the contract between one
 * layout (`scene.ts`) and two renderers (`backend-pdf.ts`, `backend-canvas.ts`).
 *
 * Why not just draw twice? Because the A5 PDF and the 1200×630 social card would
 * drift apart within a week, and the drift would be invisible until someone
 * shared a link. A scene is also unit-testable without comparing pixels: the
 * tests assert on nodes, not on bytes.
 *
 * Coordinates are POINTS with y growing DOWN from the top-left corner (the
 * canvas convention). The PDF backend flips y once, at the boundary. Text `y` is
 * the BASELINE in both backends, which is the only way the two agree.
 *
 * CONTRACT: a backend must handle every `kind` it understands and silently skip
 * one it does not. A certificate never fails to render (SPEC §20.7).
 */
import type { GameId } from '@arena/game-core';

/** 0–255 per channel; backends convert to whatever their API wants. */
export type Rgb = readonly [number, number, number];

/** Which embedded face to use. Rajdhani ships bold only, hence no weight here. */
export type FontRole = 'display' | 'mono' | 'mono-bold';

/** How to react when a text node exceeds its `maxWidth`. */
export type TextFit = 'shrink' | 'ellipsis';

export type TextAlign = 'left' | 'center' | 'right';

/** Named background art; the backend resolves the key to actual image bytes. */
export type ImageKey = 'certificate-bg' | 'certificate-share';

export interface TextNode {
  kind: 'text';
  text: string;
  x: number;
  /** Baseline. */
  y: number;
  size: number;
  font: FontRole;
  color: Rgb;
  align?: TextAlign;
  maxWidth?: number;
  fit?: TextFit;
  /** Extra space between characters, in points (HUD kickers use it heavily). */
  tracking?: number;
  opacity?: number;
}

export interface RectNode {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: Rgb;
  stroke?: Rgb;
  lineWidth?: number;
  opacity?: number;
}

export interface LineNode {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: Rgb;
  lineWidth: number;
  opacity?: number;
}

export interface ImageNode {
  kind: 'image';
  src: ImageKey;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QrNode {
  kind: 'qr';
  /** Row-major module matrix; `true` = dark. */
  modules: readonly (readonly boolean[])[];
  x: number;
  y: number;
  size: number;
  color: Rgb;
}

/** The real final board of the certified match, drawn by `og/boards.ts`. */
export interface BoardNode {
  kind: 'board';
  game: GameId;
  state: unknown;
  x: number;
  y: number;
  size: number;
}

export type Node = TextNode | RectNode | LineNode | ImageNode | QrNode | BoardNode;

export interface Scene {
  width: number;
  height: number;
  /** Painted before anything else, so a missing background art never shows white. */
  background: Rgb;
  nodes: Node[];
}

export const hexToRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Brand palette (mirrors apps/web/src/index.css and scripts/gen/lib/prompt-kit.ts). */
export const PALETTE = {
  bg: hexToRgb('#05070c'),
  panel: hexToRgb('#080d18'),
  p1: hexToRgb('#35e7ff'),
  p2: hexToRgb('#ff3d9a'),
  edu: hexToRgb('#b6ff3c'),
  violet: hexToRgb('#a78bfa'),
  text: hexToRgb('#dce6f5'),
  dim: hexToRgb('#8590ad'),
  faint: hexToRgb('#5d6784'),
} as const;
