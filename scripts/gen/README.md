# scripts/gen — Gemini asset generators

Pipeline for brand + gameplay assets, ported from `grzybiarz-mono`. Direct REST
to Gemini (no SDK), deterministic post-processing with `sharp`. Full plan:
[`docs/ASSETS-PLAN.md`](../../docs/ASSETS-PLAN.md).

## Layout

```
scripts/gen/
  lib/
    gemini.ts       REST client: generateImage() + retry + rate-limit + decode
    sharp.ts        resizeCover / chromaKeyToAlpha / toWebp
    ico.ts          buildIco() — byte-packed PNG-in-ICO favicon
    prompt-kit.ts   Cyber-HUD STYLE_PREAMBLE, PALETTE, buildPrompt()
    assets.ts       repo paths, outDir(), parseArgs(), writePromptFile()
  preview-prompts.ts  dry preview → assets/generated/_prompts/  (no API)
```

Renders land in `assets/generated/**` (git-ignored); `place-assets.ts` (later
phase) distributes them into `apps/web/public/**`.

## Setup

Put a key in the repo-root `.env` (see `.env.example`):

```
GEMINI_API_KEY=...            # https://aistudio.google.com/apikey
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview   # optional override
GEMINI_RPM=10                 # optional client-side rate limit
```

## Run

```bash
pnpm assets:prompts     # write sample prompts, ZERO API calls
pnpm assets:typecheck   # typecheck the generators
# generators (later phases) support: --dry-run --variants=N --only=<id> --skip-existing
```

## Conventions

- The API ignores size/aspect/seed — dimensions are forced by `sharp`, series
  consistency is prose-only.
- Transparent assets render on a flat **green `#00FF00`** matte (default) and are
  keyed by `chromaKeyToAlpha` using **color dominance** (`g - max(r,b)`), which is
  brightness-independent — the model paints the matte anywhere from `#069a06` to
  `#05c704`, so a distance-to-`#00FF00` test leaves teal residue.
- **Not cyan and not magenta as a matte** — the brand uses both (P1 cyan, P2 magenta).
- ⚠️ **Green matte and the brand lime `#B6FF3C` are mutually exclusive.** Lime is
  green-dominant (`g 255 > max(r,b) 182`), so the keyer cuts it out and the
  de-spill drags the remains to olive/gold. `buildPrompt` therefore bans lime on
  any green-keyed asset. Use lime **only on opaque assets** (e.g. the hero).
  A magenta matte is not an escape hatch — it would eat the brand magenta instead.
- The model's two recurring failures: painting the matte **white** instead of green,
  and drifting to **gold/amber**. Both are countered in the prompt kit; always
  eyeball the `-preview.png` before shipping an asset.
- Never bake text into an image; the app shell overlays all copy.
