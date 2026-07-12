/**
 * Phase 4 — hero, Quick Start steps, educational section and empty state.
 *
 * These are the assets where generated art genuinely belongs: large, decorative,
 * and never load-bearing for readability. (Board cells and game tiles are sharp
 * geometry instead — see GameGlyph.tsx and SPEC §7.4.)
 *
 *   pnpm tsx scripts/gen/sections.ts --dry-run
 *   pnpm tsx scripts/gen/sections.ts --only=hero-banner --variants=3
 *   pnpm tsx scripts/gen/sections.ts --rekey
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AssetSpec, buildPrompt } from './lib/prompt-kit';
import { buildContactSheet, generateSpec, rekeySpec } from './lib/render';
import { outDir, parseArgs, writePromptFile } from './lib/assets';

const CATALOG: AssetSpec[] = [
  {
    id: 'hero-banner',
    asset: 'Wide hero backdrop behind the home headline. Purely decorative — text sits on top of it.',
    subject:
      'A tactical arena seen head-on: two neon combatant sigils, one cyan and one magenta, facing off across a receding perspective grid that fades into the dark. Telemetry brackets and a horizontal scanner sweep read the space between them.',
    composition:
      'Wide 16:9. Energy concentrated in the centre and right; the LEFT THIRD stays calm and very dark so headline text laid over it stays readable. Everything fades to near-black at the edges.',
    technical: '1600x900 landscape.',
  },
  {
    id: 'quickstart-1',
    asset: 'Quick-start step 1 illustration — choosing a game.',
    subject:
      'Two angular HUD cards side by side: one holding a small 3x3 grid, the other a battleship radar grid of dots. A bright cyan selection bracket snaps around one of them.',
    composition:
      'Balanced pair, centred, generous dark margin, top-left corner kept clear for a numbered step badge.',
    technical: '800x600.',
    transparent: 'green',
  },
  {
    id: 'quickstart-2',
    asset: 'Quick-start step 2 illustration — adding a player (an API key, an in-browser model, or a human).',
    subject:
      'Three angular HUD slots feeding into one socket: a stylised key form, a glowing processor chip, and a simple human silhouette marker. Thin connector lines run from each slot into the socket.',
    composition:
      'Three elements fanned toward a single point, centred, clear dark margins, top-left corner left empty for a step badge.',
    technical: '800x600.',
    transparent: 'green',
    no: ['no keyboards, no literal padlocks, no realistic hands'],
  },
  {
    id: 'quickstart-3',
    asset: 'Quick-start step 3 illustration — running the match and watching the telemetry.',
    subject:
      'A live game board framed by pulsing corner brackets with a scanner line sweeping across it, flanked by thin telemetry bars and a rising timeline trace. Cyan and magenta compete across the board.',
    composition: 'Board slightly left, telemetry to the right, centred overall, top-left corner clear.',
    technical: '800x600.',
    transparent: 'green',
  },
  {
    id: 'quickstart-4',
    asset: 'Quick-start step 4 illustration — the result, precision score and Elo ranking.',
    subject:
      'A HUD result panel: a stepped ranking ladder rising to the right, a small five-axis radar shape, and a climbing line trace. A lime accent marks the positive, educational outcome.',
    composition: 'Ladder and radar balanced side by side, centred, dark margins, top-left corner clear.',
    technical: '800x600.',
    transparent: 'green',
  },
  {
    id: 'section-edu',
    asset: 'Illustration for the educational section "why this works" — measuring how a model thinks.',
    subject:
      'An abstract reasoning graph — nodes and edges branching like a decision tree — being measured by HUD calipers and telemetry readouts. Lime accents mark the measured, understood parts.',
    composition: 'Graph occupying the centre-left, measurement overlays to the right, wide format, dark margins.',
    technical: '1200x600.',
    transparent: 'green',
  },
  {
    id: 'empty-state',
    asset: 'Empty-state illustration for charts and the leaderboard when there is not enough data yet.',
    subject:
      'An empty HUD frame with a flat, silent telemetry line running through it and a dim targeting reticle searching for a signal that is not there. Restrained, quiet, dimmed.',
    composition: 'Centred, minimal, lots of empty space; dim and low-contrast — it must not shout.',
    technical: '800x500.',
    transparent: 'green',
    no: ['no bright neon, keep it dim and muted'],
  },
];

const HERO_HINTS = [
  'wider, calmer, the two sigils further apart',
  'deeper perspective, the grid receding further into the dark',
  'tighter framing, stronger neon rim on the two sigils',
];

async function main(): Promise<void> {
  const args = parseArgs();
  const rekey = process.argv.slice(2).includes('--rekey');
  const specs = CATALOG.filter((s) => !args.only || s.id === args.only);
  const dir = outDir('sections');

  for (const spec of specs) {
    if (args.dryRun) {
      console.log(`  ✎ ${spec.id} → ${writePromptFile(spec.id, buildPrompt(spec))}`);
      continue;
    }
    const previews = rekey
      ? await rekeySpec(dir, spec)
      : await generateSpec(dir, spec, args.variants, spec.id === 'hero-banner' ? HERO_HINTS : []);

    if (previews.length > 1) {
      const sheet = join(dir, `_${spec.id}-sheet.png`);
      writeFileSync(sheet, await buildContactSheet(previews));
      console.log(`  ▦ contact sheet → ${sheet}`);
    }
  }
}

await main();
