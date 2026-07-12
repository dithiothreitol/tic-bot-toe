/**
 * Phase 2 — brand core generator.
 *
 * Generates the logo mark as N variants on a green chroma matte, keys each to
 * transparency, and writes the raw render, the transparent master and a
 * dark-background preview. With >1 variant it also builds a labelled contact
 * sheet for picking. Icons are derived from the chosen master by icons.ts.
 *
 *   pnpm tsx scripts/gen/brand.ts --dry-run
 *   pnpm tsx scripts/gen/brand.ts --only=logo-mark --variants=6
 *   pnpm tsx scripts/gen/brand.ts --only=logo-mark --rekey   # re-key saved raws, no API
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AssetSpec, buildPrompt } from './lib/prompt-kit';
import { buildContactSheet, generateSpec, rekeySpec } from './lib/render';
import { outDir, parseArgs, writePromptFile } from './lib/assets';

const CATALOG: AssetSpec[] = [
  {
    id: 'logo-mark',
    asset: 'App logo mark and favicon source. Must read clearly down to 16px.',
    subject:
      'A minimal emblem for an AI game arena, built from a sharp 45-degree rotated square (a rhombus) split along one diagonal into a cyan half and a magenta half — reading instantly as two opposing players meeting head-to-head. Angular and faceted with a faint inner bevel and a thin neon edge glow. Iconic and memorable at a single glance.',
    composition:
      'Perfectly centered, symmetrical, roughly 16% safe padding on all sides, generous empty space, the mark alone with no scene, no ground plane and no props. Keep any neon glow tight to the edge of the mark — no wide bloom, haze or halo spreading across the background; keep a crisp boundary between the mark and the flat field.',
    technical: '1024x1024 square.',
    transparent: 'green',
    no: ['no board lines, no X or O glyphs, no chess pieces, no game board'],
  },
];

/** Per-variant nudges — the API has no seed, so diversity comes from prose. */
const VARIANT_HINTS = [
  'emphasize the clean diagonal split, flat and confident',
  'wrap the mark in thin L-shaped HUD corner brackets',
  'a bolder, chunkier silhouette with a heavier neon edge',
  'thinner forms, more negative space, airy and precise',
  'a faint tech-grid texture etched inside the two halves',
  'sharper faceted geometry, like a cut gem or targeting reticle',
];

async function main(): Promise<void> {
  const args = parseArgs();
  const rekey = process.argv.slice(2).includes('--rekey');
  const specs = CATALOG.filter((s) => !args.only || s.id === args.only);
  const dir = outDir('brand');

  for (const spec of specs) {
    if (args.dryRun) {
      console.log(`  ✎ ${spec.id} → ${writePromptFile(spec.id, buildPrompt(spec))}`);
      continue;
    }
    const previews = rekey
      ? await rekeySpec(dir, spec)
      : await generateSpec(dir, spec, args.variants, VARIANT_HINTS);

    if (previews.length > 1) {
      const sheet = join(dir, `_${spec.id}-sheet.png`);
      writeFileSync(sheet, await buildContactSheet(previews));
      console.log(`  ▦ contact sheet → ${sheet}`);
    }
  }
}

await main();
