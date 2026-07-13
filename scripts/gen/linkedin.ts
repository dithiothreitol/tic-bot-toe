/**
 * One-off marketing asset — hero image for a LinkedIn post about tic-bot-toe.
 * Thesis: with AI the most effective learning is practice (playing in the
 * arena), not multi-week training courses. Same Cyber-HUD prompt kit as the
 * in-app art; opaque (no chroma matte) so the lime educational accent is allowed.
 *
 *   pnpm tsx scripts/gen/linkedin.ts --dry-run
 *   pnpm tsx scripts/gen/linkedin.ts --variants=3
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE, type AssetSpec, buildPrompt } from './lib/prompt-kit';
import { generateImage } from './lib/gemini';
import { resizeCover } from './lib/sharp';
import { outDir, parseArgs, writePromptFile } from './lib/assets';

const SPEC: AssetSpec = {
  id: 'linkedin-arena',
  asset:
    'Wide social hero banner for a LinkedIn post about learning AI by DOING — pitting language models against each other in a live arena — instead of sitting through multi-week training courses. Purely decorative background; ALL copy lives in the LinkedIn post body and is NEVER drawn on the image.',
  subject:
    'A dark tactical command console that reads as one continuous scene shading from left to right. On the LEFT: a short stack of dim, identical, desaturated flat panels with a single flat, inert horizontal progress line crawling through them and stalling — passive, grey, going nowhere (the abandoned multi-week "course"). It flows RIGHT into a LIVE arena that dominates the frame: a cyan combatant sigil and a magenta combatant sigil face off across a receding perspective grid, ringed by pulsing L-shaped corner brackets and swept by a horizontal scanner line; beside them rising telemetry bars, a climbing line trace and a small five-axis radar shape actively MEASURE the duel. A bright beam of momentum carries from the dim left panels into the glowing arena.',
  composition:
    'Wide 1.91:1 banner. Left third quiet, dim and desaturated with generous near-black negative space; energy, neon and motion build toward the centre-right where the live arena sits. Strong vignette — everything fades to near-black at all four edges so the banner crops safely and copy can sit over any edge.',
  colors: `Use ONLY these hex values, do not invent colors: background ${PALETTE.bg}, panel ${PALETTE.panel}, cyan ${PALETTE.p1} for Player 1, magenta ${PALETTE.p2} for Player 2, violet ${PALETTE.violet} and desaturated slate-grey for the dim left "course" stack, lime ${PALETTE.edu} used sparingly ONLY on the telemetry / measurement overlays on the right to mark the live, measured "practice" side.`,
  no: [
    'no certificates, no diplomas, no slides, no presentation charts, no whiteboards, no graduation caps, no classrooms, no literal books',
    'no hard dividing wall or split-screen seam down the middle — it stays a single continuous console',
  ],
  technical: '1600x836 landscape, 1.91:1 aspect for a LinkedIn share image.',
};

const HINTS = [
  'lean into the contrast — the left stack noticeably dimmer and greyer, the right arena brighter and more alive',
  'cleaner and more spacious — fewer telemetry elements, the two sigils larger, the perspective grid deeper',
  'tighter, more cinematic framing, a stronger neon rim on the two sigils and a more pronounced scanner sweep',
];

// LinkedIn: 1.91:1 link/share image, plus a 1:1 square for a feed image post.
const CROPS: [string, number, number][] = [
  ['1200x628', 1200, 628],
  ['1200x1200', 1200, 1200],
];

async function main(): Promise<void> {
  const args = parseArgs();
  const dir = outDir('linkedin');
  const base = buildPrompt(SPEC);

  if (args.dryRun) {
    console.log(`  ✎ ${SPEC.id} → ${writePromptFile(SPEC.id, base)}`);
    return;
  }

  for (let v = 1; v <= args.variants; v++) {
    const label = args.variants > 1 ? `${SPEC.id}-v${v}` : SPEC.id;
    const hint = HINTS[(v - 1) % HINTS.length];
    const prompt = args.variants > 1 ? `${base}\n\nVARIANT: ${hint}` : base;
    process.stdout.write(`  ⧗ ${label} … `);
    try {
      const raw = await generateImage(prompt);
      writeFileSync(join(dir, `${label}-raw.png`), raw);
      for (const [name, w, h] of CROPS) {
        writeFileSync(join(dir, `${label}-${name}.png`), await resizeCover(raw, w, h));
      }
      console.log('ok');
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
    }
  }
  console.log(`\n  → ${dir}`);
}

await main();
