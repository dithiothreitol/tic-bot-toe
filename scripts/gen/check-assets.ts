/**
 * Phase 7 — asset QA. Three checks, no API:
 *
 *  1. ALPHA     — assets that are supposed to be transparent really are (a matte
 *                 that failed to key produces an opaque rectangle that only shows
 *                 up once it is on the page).
 *  2. CONTRAST  — WCAG ratio of every palette color against the HUD background.
 *  3. CSP       — the built frontend references no off-origin images/media/fonts;
 *                 the app ships `default-src 'self'`, so an external URL is a
 *                 broken asset in production, not just a policy nit.
 *
 *   pnpm tsx scripts/gen/check-assets.ts
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PALETTE } from './lib/prompt-kit';
import { REPO_ROOT, WEB_PUBLIC } from './lib/assets';

let failures = 0;
const fail = (msg: string): void => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
const ok = (msg: string): void => console.log(`  ✔ ${msg}`);

// ---------------------------------------------------------------- 1. alpha
console.log('\n// ALPHA — transparent assets must actually carry alpha');

const MUST_BE_TRANSPARENT = [
  'logo.png',
  'quickstart-1.webp',
  'quickstart-2.webp',
  'quickstart-3.webp',
  'quickstart-4.webp',
  'section-edu.webp',
  'empty-state.webp',
];

for (const name of MUST_BE_TRANSPARENT) {
  const file = join(WEB_PUBLIC, name);
  if (!existsSync(file)) {
    fail(`${name} — missing`);
    continue;
  }
  const img = sharp(file);
  const meta = await img.metadata();
  if (!meta.hasAlpha) {
    fail(`${name} — no alpha channel (the chroma matte did not key out)`);
    continue;
  }
  const stats = await img.stats();
  const alpha = stats.channels[3];
  if (!alpha || alpha.min > 0) {
    fail(`${name} — alpha present but fully opaque (min=${alpha?.min ?? '?'})`);
    continue;
  }
  ok(`${name} — real alpha (min ${alpha.min}, mean ${alpha.mean.toFixed(0)})`);
}

// ------------------------------------------------------------- 2. contrast
console.log('\n// CONTRAST — WCAG ratio against the page background');

const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Relative luminance (WCAG 2.x). */
function luminance(hex: string): number {
  const srgb = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 4.5 = AA body text; 3.0 = AA large text / UI components. */
const TEXT_COLORS: [string, string, number][] = [
  ['foreground', PALETTE.text, 4.5],
  ['muted-fg  ', '#8A96B8', 4.5],
  ['dim-fg    ', PALETTE.dim, 4.5],
  ['faint-fg  ', '#4B587C', 3.0],
  ['p1 cyan   ', PALETTE.p1, 4.5],
  ['p2 magenta', PALETTE.p2, 4.5],
  ['edu lime  ', PALETTE.edu, 4.5],
  ['danger    ', PALETTE.danger, 3.0],
  ['warn      ', PALETTE.warn, 3.0],
  ['violet    ', PALETTE.violet, 3.0],
];

for (const [name, hex, min] of TEXT_COLORS) {
  const r = ratio(hex, PALETTE.bg);
  const line = `${name} ${hex} → ${r.toFixed(2)}:1 (needs ${min.toFixed(1)})`;
  if (r >= min) ok(line);
  else fail(line);
}

// ------------------------------------------------------------------ 3. CSP
console.log('\n// CSP — the built frontend must not reference off-origin assets');

const DIST = join(REPO_ROOT, 'apps', 'web', 'dist');
if (!existsSync(DIST)) {
  fail('apps/web/dist missing — run `pnpm --filter @arena/web build` first');
} else {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(html|css)$/.test(entry.name)) files.push(p);
    }
  };
  walk(DIST);

  // url(https://…) in CSS, or src/href to an off-origin image/media/font in HTML.
  const OFFENDERS =
    /(url\(\s*['"]?https?:\/\/[^)]+\)|(?:src|href|poster)=["']https?:\/\/[^"']+\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|webm|mp4)["'])/gi;

  let hits = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(OFFENDERS)) {
      fail(`${file.replace(DIST, 'dist')} → ${m[0].slice(0, 90)}`);
      hits++;
    }
  }
  if (hits === 0) ok(`${files.length} built html/css file(s) — all assets same-origin`);
}

console.log(
  failures === 0 ? '\n✔ asset QA passed\n' : `\n✗ asset QA: ${failures} problem(s)\n`,
);
process.exit(failures === 0 ? 0 : 1);
