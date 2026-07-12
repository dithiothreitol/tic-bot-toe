/**
 * Distributor — copies reviewed renders from assets/generated/** into the app.
 *
 * On-page art becomes WebP (quality 82, alpha preserved). Social/OG images stay
 * PNG, because some crawlers still do not fetch WebP. Icons are NOT handled here
 * — they are derived from the logo master by icons.ts.
 *
 *   pnpm tsx scripts/gen/place-assets.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { GENERATED_DIR, WEB_PUBLIC } from './lib/assets';

interface Op {
  from: string;
  to: string;
  width: number;
  height: number;
  /** 'contain' preserves the whole illustration (transparent art); 'cover' fills. */
  fit: 'contain' | 'cover';
  /**
   * Margin to leave around the artwork, as a fraction of the canvas. Setting it
   * turns on scale normalisation: the generator's own empty margin is cropped
   * away first, then the artwork is re-fitted into one shared box. Renders come
   * back framed differently (the quickstart set filled 57%–85% of its canvas),
   * and 'contain' scales the *canvas*, not the drawing — so without this step
   * equally-sized files still render as visibly different-sized pictures.
   */
  margin?: number;
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

/**
 * Quickstart art sits in a short, wide tile, so height is what the eye compares.
 * This canvas is wider (2.5) than any of the four drawings (1.37–1.68), which
 * makes every one of them height-bound inside it — so all four land on the same
 * rendered height, and only their natural widths differ.
 */
const QUICKSTART = { width: 1000, height: 400, fit: 'contain', margin: 0.05 } as const;

const OPS: Op[] = [
  // Opaque hero — safe to crop to the exact banner ratio.
  { from: 'sections/hero-banner.png', to: 'hero.webp', width: 1600, height: 900, fit: 'cover' },
  // Transparent art — 'contain' so nothing gets cropped off the illustration.
  { from: 'sections/quickstart-1.png', to: 'quickstart-1.webp', ...QUICKSTART },
  { from: 'sections/quickstart-2.png', to: 'quickstart-2.webp', ...QUICKSTART },
  { from: 'sections/quickstart-3.png', to: 'quickstart-3.webp', ...QUICKSTART },
  { from: 'sections/quickstart-4.png', to: 'quickstart-4.webp', ...QUICKSTART },
  { from: 'sections/section-edu.png', to: 'section-edu.webp', width: 1200, height: 600, fit: 'contain' },
  { from: 'sections/empty-state.png', to: 'empty-state.webp', width: 800, height: 500, fit: 'contain' },
];

for (const op of OPS) {
  const src = sharp(readFileSync(join(GENERATED_DIR, op.from)));

  let pipeline: sharp.Sharp;
  if (op.margin === undefined) {
    pipeline = src.resize(op.width, op.height, {
      fit: op.fit,
      position: 'center',
      background: TRANSPARENT,
    });
  } else {
    const padX = Math.round(op.width * op.margin);
    const padY = Math.round(op.height * op.margin);
    // trim() drops the transparent border; resize() then puts every drawing on
    // the same scale. Re-open the buffer because extend() has to run after the
    // resize, not alongside it.
    const art = await src
      .trim({ background: TRANSPARENT, threshold: 10 })
      .resize(op.width - 2 * padX, op.height - 2 * padY, {
        fit: 'contain',
        background: TRANSPARENT,
      })
      .toBuffer();
    pipeline = sharp(art).extend({
      top: padY,
      bottom: padY,
      left: padX,
      right: padX,
      background: TRANSPARENT,
    });
  }

  const buf = await pipeline.webp({ quality: 82 }).toBuffer();
  writeFileSync(join(WEB_PUBLIC, op.to), buf);
  console.log(`  ✔ ${op.to.padEnd(22)} ${(buf.length / 1024).toFixed(1)} kB`);
}
