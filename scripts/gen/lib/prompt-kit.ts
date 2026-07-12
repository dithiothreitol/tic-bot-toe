/**
 * Cyber-HUD / Tactical prompt kit for tic-bot-toe asset generation.
 *
 * ONE style system on purpose — grzybiarz-mono shipped two conflicting
 * preambles and it caused drift. Palette mirrors apps/web/src/index.css; keep
 * the two in sync when the theme changes.
 */

export const PALETTE = {
  bg: '#05070C', // page background
  panel: '#080D18', // panel surface
  inset: '#060A14', // fields inside panels (cells, inputs)
  p1: '#35E7FF', // Player 1 · cyan
  p2: '#FF3D9A', // Player 2 · magenta
  edu: '#B6FF3C', // educational / positive · lime
  danger: '#FF4D6A',
  warn: '#FF8A3C',
  violet: '#A78BFA',
  text: '#DCE6F5',
  dim: '#6E7B9E',
} as const;

/** Prepended to every prompt: fixes the look, the medium and the hard bans. */
export const STYLE_PREAMBLE = `You are generating a single visual asset for "tic-bot-toe — LLM Game Arena", a dark, tactical esports-HUD web app where language models play tic-tac-toe and battleship.

STYLE: Cyber-HUD / Tactical — a dark command-console overlay. Deep near-black backdrop (${PALETTE.bg}). Angular, technical geometry with SHARP corners only (no rounded corners), thin clipped/bevelled edges. Signature devices: a faint thin cyan tech grid, L-shaped corner brackets, a sweeping horizontal scanner line, subtle scanlines, and soft neon glows. Duotone neon accent — cyan ${PALETTE.p1} (Player 1) versus magenta ${PALETTE.p2} (Player 2); lime ${PALETTE.edu} only for an educational/positive accent. Restrained, precise, high-contrast and readable — clarity over flashiness. Reference feel: tactical FPS HUD, Deus Ex / Watch Dogs interface, sci-fi mission console. NOT playful, NOT cartoonish.`;

/** Repeated everywhere — text is added by the app shell, never baked in. */
export const NEGATIVES: readonly string[] = [
  'no text, no letters, no numbers, no words, no typography, no watermark',
  'no rounded corners, no soft rounded blobs',
  'no light or white background, no pastel, no daylight',
  'no mascots, no cartoon eyes, no faces, no humans',
  'no UI screenshots, no window frames, no cursors',
  'no clutter, no lens-flare overload',
  // The model drifts to warm metallics unprompted; gold breaks the HUD palette.
  'no gold, no amber, no yellow, no bronze, no beige, no warm metallic tones',
];

// green is the DEFAULT matte — the brand uses BOTH cyan and magenta, so only a
// green (#00FF00) field is safely absent from the artwork. magenta is a fallback
// for the rare green-dominant subject. cyan is never used (it is the P1 color).
export type ChromaColor = 'green' | 'magenta';
const CHROMA_HEX: Record<ChromaColor, string> = { green: '#00FF00', magenta: '#FF00FF' };

/**
 * Instruction block for assets that must become transparent PNGs.
 * Stated forcefully because the model otherwise defaults the field to white or
 * black — the single most common failure of this pipeline.
 */
export function chromaBlock(color: ChromaColor = 'green'): string {
  const hex = CHROMA_HEX[color];
  return `BACKGROUND — THIS IS THE MOST IMPORTANT REQUIREMENT: every single pixel that is not part of the subject MUST be flat, uniform, saturated ${color} ${hex}. The background is a chroma-key matte. It must NOT be white, NOT black, NOT grey, NOT dark, NOT a gradient, and it must have NO border, frame, mat or margin of any other color — the ${hex} field runs edge to edge behind the subject. No gradient, glow, shadow or ${color} tint may bleed from the subject into the matte, and none of the ${hex} hue may appear inside the subject itself. The subject stays fully opaque on this flat ${hex} field so the background can be keyed out.`;
}

export interface AssetSpec {
  /** Stable id → filename of the render and the _prompts/ preview file. */
  id: string;
  /** ASSET: what it is + where it is used + minimum legible size. */
  asset: string;
  /** SUBJECT: the exact thing to draw. */
  subject: string;
  /** COMPOSITION: placement, safe zones, negative space. */
  composition: string;
  /** COLORS: explicit hex list. Defaults to the brand duo + surfaces. */
  colors?: string;
  /** Extra per-asset negatives, appended to the shared list. */
  no?: readonly string[];
  /** TECHNICAL: nominal size + any format note. */
  technical: string;
  /** When set, render on a chroma matte for keying to transparency. */
  transparent?: ChromaColor;
}

const BASE_COLORS = `background ${PALETTE.bg}, panel ${PALETTE.panel}, cyan ${PALETTE.p1}, magenta ${PALETTE.p2}, violet ${PALETTE.violet}, text tone ${PALETTE.text}`;

/**
 * HARD CONSTRAINT — the green matte and the brand lime are mutually exclusive.
 * Lime #B6FF3C is green-dominant (g 255 > max(r,b) 182), so on a green-keyed
 * asset the keyer would cut it out and the de-spill would drag what survives to
 * olive/gold. Lime is therefore only allowed on opaque assets. (A magenta matte
 * is not an escape hatch: it would eat the brand magenta #FF3D9A instead.)
 */
function colorsFor(spec: AssetSpec): string {
  if (spec.colors) return spec.colors;
  return spec.transparent === 'green'
    ? `Use ONLY these hex values, do not invent colors: ${BASE_COLORS}. Use NO green and NO lime anywhere in the subject — green is reserved for the background matte.`
    : `Use ONLY these hex values, do not invent colors: ${BASE_COLORS}, lime ${PALETTE.edu}.`;
}

/** Assemble the final prompt string from a spec. */
export function buildPrompt(spec: AssetSpec): string {
  const extraNegatives =
    spec.transparent === 'green'
      ? ['no green, no lime, no yellow-green or olive tones anywhere in the subject']
      : [];
  const negatives = [...NEGATIVES, ...extraNegatives, ...(spec.no ?? [])].join('; ');
  const background = spec.transparent
    ? chromaBlock(spec.transparent)
    : `BACKGROUND: solid ${PALETTE.bg} with the faint cyan tech grid barely visible.`;
  return [
    STYLE_PREAMBLE,
    `ASSET: ${spec.asset}`,
    `SUBJECT: ${spec.subject}`,
    `COMPOSITION: ${spec.composition}`,
    `COLORS: ${colorsFor(spec)}`,
    background,
    `NO: ${negatives}`,
    `TECHNICAL: ${spec.technical} True color, crisp edges, no compression artifacts.`,
  ].join('\n\n');
}
