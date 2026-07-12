/**
 * Phase 2 — derive the full icon set from the chosen logo master.
 *
 * The app is dark-only, so favicon / apple-touch / PWA icons are rendered as a
 * dark HUD tile (#05070C) with the mark inset. That keeps them legible on both
 * light and dark browser chrome, and apple-touch-icon must not carry alpha
 * anyway. Only logo.png stays transparent — it sits on the app's dark header.
 *
 *   pnpm tsx scripts/gen/icons.ts --from=logo-mark-v5
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildIco } from './lib/ico';
import { GENERATED_DIR, WEB_PUBLIC } from './lib/assets';

const HUD = { r: 5, g: 7, b: 12, alpha: 1 } as const; // #05070C
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 } as const;

const fromArg = process.argv.slice(2).find((a) => a.startsWith('--from='));
const MASTER = join(GENERATED_DIR, 'brand', `${fromArg ? fromArg.slice('--from='.length) : 'logo-mark-v5'}.png`);

/** Trim the transparent border so padding is predictable across sizes. */
const trimmed = await sharp(MASTER).trim().png().toBuffer();

async function markAt(inner: number): Promise<Buffer> {
  return sharp(trimmed).resize(inner, inner, { fit: 'contain', background: CLEAR }).png().toBuffer();
}

/** Transparent mark on an empty square (for the in-app header). */
async function renderMark(size: number, inset = 0.04): Promise<Buffer> {
  const mark = await markAt(Math.round(size * (1 - 2 * inset)));
  return sharp({ create: { width: size, height: size, channels: 4, background: CLEAR } })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Mark centered on an opaque dark HUD tile. */
async function renderTile(size: number, inset: number): Promise<Buffer> {
  const mark = await markAt(Math.round(size * (1 - 2 * inset)));
  return sharp({ create: { width: size, height: size, channels: 4, background: HUD } })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const write = (name: string, buf: Buffer): void => {
  writeFileSync(join(WEB_PUBLIC, name), buf);
  console.log(`  ✔ ${name.padEnd(24)} ${(buf.length / 1024).toFixed(1)} kB`);
};

// Header mark — transparent, sits on the dark app chrome.
write('logo.png', await renderMark(256));

// Favicons — dark tile, tight inset so the mark stays big at 16px.
const ico16 = await renderTile(16, 0.08);
const ico32 = await renderTile(32, 0.08);
const ico48 = await renderTile(48, 0.08);
write('favicon.ico', buildIco([
  { size: 16, png: ico16 },
  { size: 32, png: ico32 },
  { size: 48, png: ico48 },
]));
write('favicon-32.png', ico32);

// Apple touch icon — opaque, iOS applies its own rounding.
write('apple-touch-icon.png', await renderTile(180, 0.12));

// PWA icons. "maskable" needs the mark inside the central ~66% safe zone.
write('icon-192.png', await renderTile(192, 0.12));
write('icon-512.png', await renderTile(512, 0.12));
write('icon-maskable-512.png', await renderTile(512, 0.21));
