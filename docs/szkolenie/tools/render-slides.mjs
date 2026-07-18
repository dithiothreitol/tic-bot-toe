/**
 * Render karuzeli LinkedIn (Etap 5 / 0b, decyzja D4).
 * slides.html → 10× PNG 1080×1350 (@2x) + jeden PDF (post dokumentowy).
 * Deterministyczne: poprawka = edycja slides.html + ponowny render (bez API graficznego).
 *
 *   node docs/szkolenie/tools/render-slides.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = pathToFileURL(join(here, 'slides.html')).href;
const OUT = join(here, '..', 'karuzela');
mkdirSync(OUT, { recursive: true });

const IDS = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto(SRC, { waitUntil: 'networkidle', timeout: 45000 });
// Czekaj na fonty (Rajdhani / JetBrains Mono) — bez tego pierwszy render łapie fallback.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

// 1) PNG per slajd (post wielo-obrazkowy).
for (let i = 0; i < IDS.length; i++) {
  const el = page.locator('#' + IDS[i]);
  const file = String(i + 1).padStart(2, '0') + '.png';
  await el.screenshot({ path: join(OUT, file) });
  console.log('PNG ', file);
}

// 2) PDF całej karuzeli (post dokumentowy) — jedna strona = jeden slajd (@page w CSS).
await page.pdf({
  path: join(OUT, 'karuzela.pdf'),
  width: '1080px', height: '1350px',
  printBackground: true, preferCSSPageSize: true,
});
console.log('PDF  karuzela.pdf');

await browser.close();
console.log('\nGotowe →', OUT);
