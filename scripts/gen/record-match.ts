/**
 * Phase 6 — record a REAL match to a short looping webm.
 *
 * Playwright drives the actual app (model vs model, free OpenRouter models), so
 * the clip shows the real product, not an AI impression of it. The raw recording
 * covers the whole session; ffmpeg then trims it down to the match itself.
 *
 * Needs: a preview server running (pnpm --filter @arena/web exec vite preview),
 * OPENROUTER_API_KEY in .env, and ffmpeg on PATH.
 *
 *   pnpm tsx scripts/gen/record-match.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { GENERATED_DIR } from './lib/assets';

const BASE = process.env.RECORD_BASE_URL ?? 'http://localhost:4173';
const KEY = process.env.OPENROUTER_API_KEY;
const SIZE = { width: 1280, height: 860 };
const MATCH_TIMEOUT = 300_000;

const OUT = join(GENERATED_DIR, 'video');
const RAW = join(OUT, 'raw');

if (!KEY) throw new Error('OPENROUTER_API_KEY is not set (see .env).');

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

/**
 * Open a model picker, switch on the free-only filter and take the Nth option.
 *
 * The free-only switch filters ONLY the OpenRouter group — WebLLM models are
 * always listed, and they come FIRST. Picking option[0] blindly therefore grabs
 * a WebLLM model and kicks off a multi-hundred-MB weight download instead of
 * playing. WebGPU is disabled below so that group never renders at all.
 */
async function pickFreeModel(
  page: import('playwright').Page,
  comboIndex: number,
  optionIndex: number,
): Promise<string> {
  await page.getByRole('combobox').nth(comboIndex).click();
  // Both pickers render id="only-free", but Radix only mounts the open popover.
  await page.locator('#only-free').click();
  const option = page.getByRole('option').nth(optionIndex);
  await option.waitFor({ timeout: 30_000 });
  const name = (await option.innerText()).split('\n')[0] ?? '?';
  await option.click();
  return name;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: RAW, size: SIZE },
  colorScheme: 'dark',
});

// Seed the key exactly where the app keeps it (zustand persist, §16), and hide
// WebGPU so the WebLLM group never appears — we want a real API match, not a
// browser weight download.
await context.addInitScript((key: string) => {
  Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  window.localStorage.setItem(
    'arena-settings',
    JSON.stringify({
      state: {
        openRouterKey: key,
        soundEnabled: false,
        nickname: null,
        playerToken: 'rec0000000000000000000000000000000',
      },
      version: 1,
    }),
  );
}, KEY);

const contextStart = Date.now();
const page = await context.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });

console.log('  · mode → model vs model');
await page.getByRole('tab', { name: 'Model kontra model' }).click();

console.log('  · picking two different free models…');
const m1 = await pickFreeModel(page, 0, 0);
const m2 = await pickFreeModel(page, 1, 1);
console.log(`    P1 = ${m1}`);
console.log(`    P2 = ${m2}`);

await page.getByRole('button', { name: 'Start', exact: true }).click();

// model-vs-model is gated on the viewer prediction (§12.5) — skip it.
const skip = page.getByRole('button', { name: 'Pomiń i zagraj' });
if (await skip.isVisible().catch(() => false)) await skip.click();

const matchStart = Date.now();
console.log('  · match running…');

// A failed match also lands on the result card, so wait for a REAL move first —
// otherwise we would happily record an empty board and call it gameplay.
await page.getByText('Brak ruchów.').waitFor({ state: 'hidden', timeout: 120_000 });

await page
  .getByRole('button', { name: /Rewanż|Nowa gra/ })
  .first()
  .waitFor({ timeout: MATCH_TIMEOUT });
const matchEnd = Date.now();

const moveRows = await page.locator('[data-slot="hud-panel"]').filter({ hasText: 'LOG PARTII' }).innerText();
if (/Brak ruchów/.test(moveRows)) throw new Error('Match produced no moves — refusing to ship an empty clip.');

await page.waitForTimeout(2500); // let the result card settle on screen
await context.close(); // flushes the video file
await browser.close();

const raw = readdirSync(RAW).find((f) => f.endsWith('.webm'));
if (!raw) throw new Error('Playwright produced no video.');

const from = Math.max(0, (matchStart - contextStart) / 1000 - 0.6);
const dur = (matchEnd - matchStart) / 1000 + 3;
const rawPath = join(RAW, raw);
const clip = join(OUT, 'match.webm');
const poster = join(OUT, 'match-poster.png');

console.log(`  · match lasted ${dur.toFixed(1)}s — trimming from ${from.toFixed(1)}s`);

// VP9: small, alpha-free, plays everywhere we care about. No audio track at all.
execFileSync(
  'ffmpeg',
  ['-y', '-ss', String(from), '-i', rawPath, '-t', String(dur), '-an',
   '-vf', 'scale=1000:-2', '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1',
   clip],
  { stdio: 'inherit' },
);
// Late in the match, so the poster shows a filled board rather than an empty one.
execFileSync(
  'ffmpeg',
  ['-y', '-ss', String(from + dur * 0.8), '-i', rawPath, '-frames:v', '1',
   '-vf', 'scale=1000:-2', poster],
  { stdio: 'inherit' },
);

if (!existsSync(clip)) throw new Error('ffmpeg produced no clip.');
console.log(`\n  ✔ ${clip}`);
console.log(`  ✔ ${poster}`);
