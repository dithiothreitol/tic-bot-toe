/**
 * Dry preview — build representative prompts through the kit and write them to
 * assets/generated/_prompts/. Makes ZERO API calls; use it to tune wording
 * before spending on generation.
 *
 *   pnpm assets:prompts
 */
import { buildPrompt, type AssetSpec } from './lib/prompt-kit';
import { writePromptFile } from './lib/assets';

const SAMPLES: AssetSpec[] = [
  {
    id: 'logo-mark',
    asset: 'App logo mark and favicon source. Must stay legible down to 16px.',
    subject:
      'An abstract emblem for an AI game arena: a sharp 45-degree rotated diamond split diagonally into a cyan half and a magenta half, reading as two opposing players meeting on a grid. Iconic, minimal, understood at a glance.',
    composition:
      'Perfectly centered, symmetrical, roughly 14% safe padding, generous negative space, no scene or background props.',
    technical: '1024x1024 square.',
    transparent: 'green',
    no: ['no board lines, no X or O glyphs, no chess pieces'],
  },
  {
    id: 'tile-tictactoe',
    asset: 'Game-select tile thumbnail for "Kolko i krzyzyk" (tic-tac-toe).',
    subject:
      'A 3x3 tactical grid glowing faintly, with one cyan X and one magenta O locked in as if mid-match, neon HUD styling.',
    composition:
      'Centered board, thin angular frame with corner brackets, empty lower band left clear for an overlaid label.',
    technical: '640x480.',
    transparent: 'green',
  },
  {
    id: 'hero-banner',
    asset: 'Home hero background banner sitting behind the headline.',
    subject:
      'A wide tactical arena: two neon combatant sigils (cyan versus magenta) facing off across a receding perspective grid, with telemetry brackets and a scanner sweep.',
    composition:
      'Wide 16:9, focal energy in the center, a darker calm safe zone across the left third for headline text.',
    technical: '1600x900.',
  },
  {
    id: 'quickstart-step-1',
    asset: 'Quick-start step illustration #1 — "Wybierz gre" (choose a game).',
    subject:
      'Two angular HUD cards side by side — one showing a mini tic-tac-toe grid, the other a battleship radar grid — with a bright selection bracket highlighting one of them.',
    composition:
      'Balanced pair, centered, HUD-panel framing, top-left corner kept clear for a numbered step badge.',
    technical: '800x600.',
    transparent: 'green',
  },
];

let n = 0;
for (const spec of SAMPLES) {
  const file = writePromptFile(spec.id, buildPrompt(spec));
  console.log(`  ✎ ${spec.id.padEnd(20)} → ${file}`);
  n++;
}
console.log(`\n${n} prompt(s) written. No API calls made (dry preview).`);
