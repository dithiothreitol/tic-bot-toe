/**
 * Shared render helpers for the generators: key a raw Gemini render, write the
 * master + a dark-background preview, and compose a labelled contact sheet.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { generateImage } from './gemini';
import { buildPrompt, type AssetSpec } from './prompt-kit';
import { chromaKeyToAlpha } from './sharp';

export const HUD_BG = { r: 5, g: 7, b: 12, alpha: 1 } as const; // #05070C
export const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 } as const;

export interface Preview {
  label: string;
  file: string;
}

/** Composite a transparent asset onto the app's dark background, for review. */
export async function previewOnDark(png: Buffer, width = 512, height = width): Promise<Buffer> {
  const art = await sharp(png).resize(width, height, { fit: 'contain', background: CLEAR }).toBuffer();
  return sharp({ create: { width, height, channels: 4, background: HUD_BG } })
    .composite([{ input: art }])
    .png()
    .toBuffer();
}

function labelSvg(text: string, w: number, h: number): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><text x="10" y="${h - 9}" font-family="monospace" font-size="18" fill="#A4ADC7">${text}</text></svg>`,
  );
}

export async function buildContactSheet(items: Preview[], cell = 360): Promise<Buffer> {
  const cols = Math.min(3, items.length);
  const rows = Math.ceil(items.length / cols);
  const layers: sharp.OverlayOptions[] = [];
  for (let i = 0; i < items.length; i++) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    const img = await sharp(items[i]!.file)
      .resize(cell - 16, cell - 16, { fit: 'contain', background: HUD_BG })
      .toBuffer();
    layers.push({ input: img, left: x + 8, top: y + 8 });
    layers.push({ input: labelSvg(items[i]!.label, cell, 30), left: x, top: y + cell - 30 });
  }
  return sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: HUD_BG } })
    .composite(layers)
    .png()
    .toBuffer();
}

/** Key a raw render (if the spec wants transparency) and write master + preview. */
export async function keyAndWrite(
  dir: string,
  spec: AssetSpec,
  label: string,
  raw: Buffer,
): Promise<Preview> {
  const keyed = spec.transparent ? await chromaKeyToAlpha(raw, spec.transparent) : raw;
  writeFileSync(join(dir, `${label}.png`), keyed);
  const file = join(dir, `${label}-preview.png`);
  writeFileSync(file, spec.transparent ? await previewOnDark(keyed) : keyed);
  return { label, file };
}

/** Re-key every saved `*-raw.png` for a spec — no API calls. */
export async function rekeySpec(dir: string, spec: AssetSpec): Promise<Preview[]> {
  const previews: Preview[] = [];
  const raws = readdirSync(dir)
    .filter((f) => f.startsWith(spec.id) && f.endsWith('-raw.png'))
    .sort();
  for (const f of raws) {
    const label = f.slice(0, -'-raw.png'.length);
    previews.push(await keyAndWrite(dir, spec, label, readFileSync(join(dir, f))));
    console.log(`  ↻ rekey ${label}`);
  }
  return previews;
}

/** Generate one spec, `variants` times, saving raw + keyed + preview each time. */
export async function generateSpec(
  dir: string,
  spec: AssetSpec,
  variants: number,
  hints: readonly string[] = [],
): Promise<Preview[]> {
  const basePrompt = buildPrompt(spec);
  const previews: Preview[] = [];
  for (let v = 1; v <= variants; v++) {
    const label = variants > 1 ? `${spec.id}-v${v}` : spec.id;
    const hint = hints.length > 0 ? hints[(v - 1) % hints.length] : null;
    const prompt = variants > 1 && hint ? `${basePrompt}\n\nVARIANT: ${hint}` : basePrompt;
    process.stdout.write(`  ⧗ ${label} … `);
    try {
      const raw = await generateImage(prompt);
      writeFileSync(join(dir, `${label}-raw.png`), raw);
      previews.push(await keyAndWrite(dir, spec, label, raw));
      console.log('ok');
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
    }
  }
  return previews;
}
