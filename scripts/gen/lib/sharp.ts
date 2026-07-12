/**
 * Deterministic post-processing for Gemini renders — all sharp, no API.
 * The model ignores requested dimensions and never emits a reliable alpha
 * channel, so we (a) force size with resize(fit:'cover') and (b) key a flat
 * chroma matte to transparency here.
 */
import sharp from 'sharp';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  alpha: number;
}
export const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, alpha: 0 };
export const BG_HUD: RGBA = { r: 5, g: 7, b: 12, alpha: 1 }; // #05070C

/** Force exact WxH (center-cropped). Background matters only when padding. */
export async function resizeCover(
  input: Buffer,
  width: number,
  height: number,
  background: RGBA = BG_HUD,
): Promise<Buffer> {
  return sharp(input)
    .resize(width, height, { fit: 'cover', position: 'center', background })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Downscale keeping aspect ratio (for deriving small icon sizes). */
export async function resizeTo(input: Buffer, size: number): Promise<Buffer> {
  return sharp(input).resize(size, size, { fit: 'contain', background: TRANSPARENT }).png().toBuffer();
}

export type ChromaKey = 'green' | 'magenta';

/**
 * Key a flat chroma matte to transparency by COLOR DOMINANCE, not distance to a
 * fixed matte hue. The model paints the "green" field at wildly varying
 * brightness (measured G from 154 to 199) and even white, so a distance-to-
 * #00FF00 test leaves teal residue on the darker greens. Dominance is
 * brightness-independent and safe here because none of the brand colors are
 * green-dominant: cyan #35E7FF has b(255) > g(231); magenta #FF3D9A has low g.
 *
 *   green   → score = g - max(r, b)   (matte is strongly green-dominant)
 *   magenta → score = min(r, b) - g   (fallback, for green-dominant subjects)
 *
 * `lo`/`hi` are the kept / fully-keyed score thresholds. Run BEFORE resizing.
 * (A white matte — the model's other failure mode — is NOT keyable this way;
 * discard those renders.)
 */
export async function chromaKeyToAlpha(
  input: Buffer,
  key: ChromaKey = 'green',
  { lo = 25, hi = 70 }: { lo?: number; hi?: number } = {},
): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += channels) {
    const r = out[i]!;
    const g = out[i + 1]!;
    const b = out[i + 2]!;
    const score = key === 'green' ? g - Math.max(r, b) : Math.min(r, b) - g;
    let alpha: number;
    if (score >= hi) alpha = 0;
    else if (score <= lo) alpha = 255;
    else alpha = Math.round((255 * (hi - score)) / (hi - lo));
    out[i + 3] = alpha;
    if (alpha > 0) {
      if (key === 'green') {
        // Global green de-spill: clamp any residual green dominance (glow edges).
        out[i + 1] = Math.min(g, Math.max(r, b));
      } else if (alpha < 255) {
        out[i] = Math.min(r, g);
        out[i + 2] = Math.min(b, g);
      }
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

export async function toWebp(input: Buffer, quality = 82): Promise<Buffer> {
  return sharp(input).webp({ quality }).toBuffer();
}
