/**
 * Zrzuty ekranu do materiałów szkoleniowych (Etap 0b, decyzja D8).
 * Łapie publiczne strony produkcji ticbottoe.lol przez Playwright/Chromium.
 *
 * Uruchomienie (z korzenia repo):
 *   node docs/szkolenie/tools/capture-screens.mjs
 *   BASE=http://localhost:5173 node docs/szkolenie/tools/capture-screens.mjs   # lokalny stack
 *
 * Czego NIE łapie automatycznie (wymaga interakcji/klucza — patrz D8):
 *   - tok myślenia na żywo i replay ze śladem (potrzebna partia z modelem),
 *   - działające demo WebLLM na home (headless nie ma WebGPU — łapiemy stan statyczny).
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://ticbottoe.lol';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'zrzuty');
mkdirSync(OUT, { recursive: true });

// Karta modelu = splat route: id ze slashami idzie wprost do ścieżki.
const MODEL_ID = 'openrouter:meta-llama/llama-3.1-8b-instruct';

const ALL_SHOTS = [
  { file: '01-home.png', path: '/', fullPage: true },
  { file: '03-leaderboard.png', path: '/rankingi', fullPage: true },
  { file: '05-muzeum-wpadek.png', path: '/muzeum-wpadek', fullPage: true },
  { file: '06-turing.png', path: '/turing', fullPage: true },
  { file: '04-karta-modelu.png', path: `/model/${MODEL_ID}`, fullPage: true },
];

// ONLY=05,06 → łap tylko pliki, których nazwa zawiera któryś z fragmentów.
const only = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SHOTS = only.length
  ? ALL_SHOTS.filter((s) => only.some((frag) => s.file.includes(frag)))
  : ALL_SHOTS;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await context.newPage();

for (const shot of SHOTS) {
  const url = BASE + shot.path;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // SPA — czekaj aż React zamontuje chrome (marka w nagłówku jest na każdej stronie),
    // sam `networkidle` bywa za wcześnie na trasach z opóźnionym fetchem (muzeum, turing).
    await page.waitForSelector('text=tic-bot-toe', { timeout: 25000 });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    // Przewiń, żeby dociągnąć leniwe sekcje/wykresy, wróć na górę.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    // Czas na wykresy/heatmapy/skanery HUD.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, shot.file), fullPage: shot.fullPage });
    console.log(`OK   ${shot.file}  ←  ${url}`);
  } catch (err) {
    console.log(`FAIL ${shot.file}  ←  ${url}  :: ${err.message.split('\n')[0]}`);
  }
}

await browser.close();
console.log('\nZrzuty w:', OUT);
