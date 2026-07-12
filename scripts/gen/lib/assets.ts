/**
 * Shared plumbing for the asset generators: repo paths, output dirs, CLI flags,
 * and dry-run prompt files. Loads GEMINI_* from the repo-root .env.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url)); // scripts/gen/lib
export const REPO_ROOT = resolve(here, '..', '..', '..');

loadEnv({ path: join(REPO_ROOT, '.env') });

export const GENERATED_DIR = join(REPO_ROOT, 'assets', 'generated');
export const WEB_PUBLIC = join(REPO_ROOT, 'apps', 'web', 'public');

/** Ensure and return assets/generated/<category>. */
export function outDir(category: string): string {
  const dir = join(GENERATED_DIR, category);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a prompt to assets/generated/_prompts/<id>.txt (used by --dry-run). */
export function writePromptFile(id: string, prompt: string): string {
  const file = join(outDir('_prompts'), `${id}.txt`);
  writeFileSync(file, prompt, 'utf8');
  return file;
}

export interface CliArgs {
  dryRun: boolean;
  variants: number;
  skipExisting: boolean;
  /** --only=<id> or --asset=<id> to run a single asset. */
  only: string | null;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  const value = (name: string): string | null => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    dryRun: argv.includes('--dry-run'),
    variants: Math.max(1, Number(value('variants') ?? 1)),
    skipExisting: argv.includes('--skip-existing'),
    only: value('only') ?? value('asset'),
  };
}
