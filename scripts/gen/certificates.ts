/**
 * Backgrounds for the achievement certificate and its social share card.
 *
 * These are pure ATMOSPHERE: glow, depth, a whisper of guilloche. Every sharp
 * thing on the finished document — frame, brackets, type, badge, board — is
 * drawn as vectors by apps/server/src/certificate. Same division of labour the
 * rest of the app uses (see scripts/gen/README.md): generated art where it is
 * decorative, geometry where it is load-bearing.
 *
 * The hardest requirement is negative: the MIDDLE MUST BE BORING. A full page of
 * text sits on it, and the model's instinct for the word "certificate" is to
 * fill the frame with seals and laurel wreaths.
 *
 *   pnpm tsx scripts/gen/certificates.ts --dry-run
 *   pnpm tsx scripts/gen/certificates.ts --variants=3
 *   pnpm tsx scripts/gen/certificates.ts --only=certificate-share
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AssetSpec, buildPrompt } from './lib/prompt-kit';
import { buildContactSheet, generateSpec } from './lib/render';
import { outDir, parseArgs, writePromptFile } from './lib/assets';

/** The model will draw a medal unless told, repeatedly, not to. */
const NO_DIPLOMA_CLICHES = [
  'no seals, no medals, no laurel wreaths, no ribbons, no rosettes, no stamps',
  'no certificate borders, no ornate frames, no corner ornaments — the frame is drawn by the app',
  'no paper texture, no parchment, no scroll, no document mockup',
];

const CATALOG: AssetSpec[] = [
  {
    id: 'certificate-bg',
    asset:
      'Full-bleed background of a printable A5 landscape achievement certificate. Purely atmospheric — a full page of text, a frame and a badge are drawn on top of it by the application.',
    subject:
      'A dark tactical command-console surface seen head-on: a deep near-black field with a faint receding cyan tech grid, a soft cyan glow rising from the lower-left corner and a soft magenta glow from the upper-right corner, thin telemetry traces dissolving into the dark at the edges, and a barely visible horizontal scanner sweep across the lower third. Woven into the darkest areas, extremely faint, almost subliminal: an engraved guilloche rosette pattern of hairline concentric curves, like the security print of a banknote, but drawn in thin cyan HUD lines instead of ink.',
    composition:
      'Wide landscape, aspect ratio about 1.42:1. The ENTIRE CENTRAL AREA — the middle 80% of the width and the middle 80% of the height — stays calm, dark, and almost completely empty, dark enough for small light text to be read over it. All energy, glow, structure and detail live in the outer margin only, and fade to near-black at the very edge. No focal point, no dominant subject, nothing the eye should stop on.',
    technical: '2480x1748 landscape, print resolution.',
    no: [...NO_DIPLOMA_CLICHES, 'nothing in the centre, no central emblem, no centred glow'],
  },
  {
    id: 'certificate-share',
    asset:
      'Background of the social share card announcing a completed daily challenge. A headline, a name and a small document illustration are drawn on top of it by the application.',
    subject:
      'The same dark tactical console field, tighter and slightly brighter: a cyan-to-magenta duotone glow sweeping diagonally across a faint dark grid, with thin telemetry traces and the suggestion of corner brackets in the outer margin.',
    composition:
      'Wide 1.9:1. The LEFT TWO THIRDS stay calm and very dark — a headline and a large name are laid over them. Glow concentrates in the top-right and bottom-left corners; the right third may carry slightly more structure. Near-black at every edge.',
    technical: '1600x840 landscape.',
    no: NO_DIPLOMA_CLICHES,
  },
];

const BG_HINTS = [
  'calmer and darker overall, the glow pushed further into the corners',
  'the guilloche engraving slightly more present in the margin, still subliminal',
  'deeper perspective on the grid, glow cooler and more restrained',
];

async function main(): Promise<void> {
  const args = parseArgs();
  const specs = CATALOG.filter((s) => !args.only || s.id === args.only);
  const dir = outDir('certificates');

  for (const spec of specs) {
    if (args.dryRun) {
      console.log(`  ✎ ${spec.id} → ${writePromptFile(spec.id, buildPrompt(spec))}`);
      continue;
    }
    const previews = await generateSpec(dir, spec, args.variants, BG_HINTS);
    if (previews.length > 1) {
      const sheet = join(dir, `_${spec.id}-sheet.png`);
      writeFileSync(sheet, await buildContactSheet(previews));
      console.log(`  ▦ contact sheet → ${sheet}`);
    }
  }
}

await main();
