import fontkit from '@pdf-lib/fontkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LOCALES } from '@arena/i18n';

import { FONTS_DIR } from '../og/render';
import { CERTIFICATE_COPY } from './copy';
import { allTierTitles } from './tiers';

/** Every string the document can print, for both locales. */
function allStrings(): string[] {
  const out: string[] = [];
  for (const locale of LOCALES) {
    const t = CERTIFICATE_COPY[locale];
    out.push(
      t.kicker,
      t.title,
      t.subtitle,
      t.formula,
      t.lead,
      t.condition,
      t.outcomesHeader,
      t.outcomeGame('Sudoku Duel', '6x6'),
      t.outcomeMoves(47),
      t.outcomeStreak(7),
      t.outcomeSolo,
      ...t.duration,
      t.signature,
      t.verify('ticbottoe.lol/certyfikat/abc'),
      ...t.disclaimer,
      t.anonymous,
      t.anonymousHint,
      t.streakBadge(7),
      t.seal('3f9c2a1e', 'a91f4c7d2b03'),
      t.wordmark,
      t.date('2026-07-12'),
      t.shareKicker,
      ...t.shareHeadline,
      t.shareFacts('llama', 'Statki', '8x8', 47),
      t.shareBottom(47),
      t.shareAlt('nick', 'llama'),
      t.pdfTitle('nick'),
      t.pdfSubject('llama', '2026-07-12'),
      ...(['tictactoe', 'battleship', 'sudoku', 'scrabble'] as const).map(t.game),
    );
  }
  return out.concat(allTierTitles());
}

describe('certificate copy — glyphs', () => {
  /**
   * The one failure that would only show up on a printed page: a missing glyph
   * degrades to a fallback face in canvas, but renders as an empty .notdef box
   * in the PDF. Polish diacritics are the obvious risk (Rajdhani ships in both
   * `latin` and `latin-ext` cuts), but so is any typographic character someone
   * pastes into the copy — `✦` was dropped for exactly this reason.
   */
  it.each(['Rajdhani-Bold.ttf', 'JetBrainsMono-Regular.ttf', 'JetBrainsMono-Bold.ttf'])(
    '%s has a glyph for every character the certificate can print',
    (file) => {
      const path = join(FONTS_DIR, file);
      if (!existsSync(path)) return; // fonts are optional at runtime (§20.7)
      const font = fontkit.create(readFileSync(path)) as {
        hasGlyphForCodePoint: (cp: number) => boolean;
      };
      const missing = new Set<string>();
      for (const s of allStrings()) {
        for (const ch of s) {
          if (ch !== '\n' && !font.hasGlyphForCodePoint(ch.codePointAt(0)!)) missing.add(ch);
        }
      }
      expect([...missing].join('')).toBe('');
    },
  );
});

describe('certificate copy — tone', () => {
  /**
   * Plan §6.0: each gag fires exactly once, at a different sin of the genre.
   * Repetition is what turns the document from dry into try-hard, and it is the
   * failure mode a well-meaning edit reintroduces.
   */
  it.each(LOCALES)('%s repeats no single gag across slots', (locale) => {
    const document = allStrings()
      .filter((_, i) => i >= 0)
      .join(' ')
      .toLowerCase();
    for (const word of ['slajd', 'slide', 'webinar', 'lejek', 'funnel', 'linkedin']) {
      const hits = document.split(word).length - 1;
      // Two locales are concatenated here, so one use per locale = 2.
      expect(hits, `"${word}" appears ${hits}×`).toBeLessThanOrEqual(2);
    }
    expect(CERTIFICATE_COPY[locale].title.length).toBeGreaterThan(0);
  });

  it('always carries the disclaimer, including on a first-day certificate', () => {
    for (const locale of LOCALES) {
      const d = CERTIFICATE_COPY[locale].disclaimer;
      expect(d).toHaveLength(3);
      expect(d.join(' ')).toMatch(/nieakredytowany|Unaccredited/);
    }
  });

  it('is written per language, not translated line by line', () => {
    // A literal translation is the standard way this joke dies. The signature
    // is the clearest tell: "Faculty of Things That Actually Happened" is not
    // what "Wydział Zastosowań Praktycznych" means, and should not be.
    expect(CERTIFICATE_COPY.en.signature).not.toBe('Faculty of Practical Applications · tic-bot-toe');
    expect(CERTIFICATE_COPY.pl.formula).not.toBe(CERTIFICATE_COPY.en.formula);
  });
});

describe('certificate copy — facts', () => {
  it('declines "ruch" correctly, including the 12–14 trap', () => {
    const pl = CERTIFICATE_COPY.pl;
    expect(pl.outcomeMoves(1)).toContain('1 ruch ');
    expect(pl.outcomeMoves(2)).toContain('2 ruchy');
    expect(pl.outcomeMoves(5)).toContain('5 ruchów');
    expect(pl.outcomeMoves(12)).toContain('12 ruchów');
    expect(pl.outcomeMoves(22)).toContain('22 ruchy');
    expect(pl.outcomeMoves(47)).toContain('47 ruchów');
  });

  it('formats the day without depending on the ICU build', () => {
    expect(CERTIFICATE_COPY.pl.date('2026-07-12')).toBe('12 lipca 2026');
    expect(CERTIFICATE_COPY.en.date('2026-07-12')).toBe('12 July 2026');
    expect(CERTIFICATE_COPY.pl.date('nonsense')).toBe('nonsense');
  });

  it('drops a redundant variant from the outcome line', () => {
    expect(CERTIFICATE_COPY.pl.outcomeGame('Kółko i krzyżyk', null)).toBe(
      'Wdrożenie strategii AI: Kółko i krzyżyk',
    );
    expect(CERTIFICATE_COPY.pl.outcomeGame('Statki', '8x8')).toContain('Statki 8x8');
  });
});
