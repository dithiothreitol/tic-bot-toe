/**
 * Streak tiers — the certificate's "career path" (plan §6.0).
 *
 * The job title is the joke; the number next to it is not. The badge always
 * renders BOTH ("LIDER STRATEGII AI · SERIA 7 DNI"), because the whole document
 * works by putting a pompous label on a fact that is actually true.
 *
 * A streak of 1 gets no badge at all: "SERIA 1 DZIEŃ" reads as consolation.
 */
import type { Locale } from '@arena/i18n';

import { type Rgb, PALETTE } from './scene-types';

export interface Tier {
  id: 'none' | 'enthusiast' | 'lead' | 'head' | 'chief';
  /** Frame, brackets and badge colour. */
  color: Rgb;
  /** `null` for `none` — no badge is drawn at all. */
  title: Record<Locale, string> | null;
}

const TIERS: readonly { min: number; tier: Tier }[] = [
  {
    min: 30,
    tier: {
      id: 'chief',
      // Lime is legal here: the certificate background is OPAQUE, so the
      // green-matte ban from scripts/gen/lib/prompt-kit.ts does not apply.
      color: PALETTE.edu,
      title: { pl: 'CHIEF AI VISIONARY (SAMOZWAŃCZY)', en: 'CHIEF AI VISIONARY (SELF-APPOINTED)' },
    },
  },
  {
    min: 14,
    tier: {
      id: 'head',
      color: PALETTE.violet,
      title: { pl: 'DYREKTOR DS. TRANSFORMACJI AI', en: 'HEAD OF AI TRANSFORMATION' },
    },
  },
  {
    min: 7,
    tier: {
      id: 'lead',
      color: PALETTE.p2,
      title: { pl: 'LIDER STRATEGII AI', en: 'AI STRATEGY LEAD' },
    },
  },
  {
    min: 2,
    tier: {
      id: 'enthusiast',
      color: PALETTE.p1,
      title: { pl: 'ENTUZJASTA AI', en: 'AI ENTHUSIAST' },
    },
  },
];

const NONE: Tier = { id: 'none', color: PALETTE.p1, title: null };

export function tierFor(streak: number): Tier {
  for (const { min, tier } of TIERS) if (streak >= min) return tier;
  return NONE;
}

/** Every title that can appear, for the width test (plan §6.0). */
export function allTierTitles(): string[] {
  return TIERS.flatMap(({ tier }) => (tier.title ? [tier.title.pl, tier.title.en] : []));
}
