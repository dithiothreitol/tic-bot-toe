/**
 * Scrabble tile sets and board premiums (plan §5.1). Official Polish (PL) and
 * English (EN) distributions — 100 tiles each, 2 blanks. Values verified against
 * the standard sets (tested in scrabble-data.test.ts: 100 tiles, correct sums).
 */

export type ScrabbleVariant = 'pl' | 'en';

export const BOARD_SIZE = 15;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;
/** H8 (column H, row 8) — the centre star the first word must cover. */
export const CENTER_CELL = 7 * BOARD_SIZE + 7;

export interface TileSpec {
  letter: string;
  count: number;
  value: number;
}

/** Blank is the '?' tile: two of them, worth 0. */
const BLANK: TileSpec = { letter: '?', count: 2, value: 0 };

/** English (standard). */
export const EN_TILES: TileSpec[] = [
  { letter: 'A', count: 9, value: 1 },
  { letter: 'B', count: 2, value: 3 },
  { letter: 'C', count: 2, value: 3 },
  { letter: 'D', count: 4, value: 2 },
  { letter: 'E', count: 12, value: 1 },
  { letter: 'F', count: 2, value: 4 },
  { letter: 'G', count: 3, value: 2 },
  { letter: 'H', count: 2, value: 4 },
  { letter: 'I', count: 9, value: 1 },
  { letter: 'J', count: 1, value: 8 },
  { letter: 'K', count: 1, value: 5 },
  { letter: 'L', count: 4, value: 1 },
  { letter: 'M', count: 2, value: 3 },
  { letter: 'N', count: 6, value: 1 },
  { letter: 'O', count: 8, value: 1 },
  { letter: 'P', count: 2, value: 3 },
  { letter: 'Q', count: 1, value: 10 },
  { letter: 'R', count: 6, value: 1 },
  { letter: 'S', count: 4, value: 1 },
  { letter: 'T', count: 6, value: 1 },
  { letter: 'U', count: 4, value: 1 },
  { letter: 'V', count: 2, value: 4 },
  { letter: 'W', count: 2, value: 4 },
  { letter: 'X', count: 1, value: 8 },
  { letter: 'Y', count: 2, value: 4 },
  { letter: 'Z', count: 1, value: 10 },
  BLANK,
];

/** Polish (standard, 100 tiles). No Q/V/X; adds ą ć ę ł ń ó ś ź ż. */
export const PL_TILES: TileSpec[] = [
  { letter: 'A', count: 9, value: 1 },
  { letter: 'Ą', count: 1, value: 5 },
  { letter: 'B', count: 2, value: 3 },
  { letter: 'C', count: 3, value: 2 },
  { letter: 'Ć', count: 1, value: 6 },
  { letter: 'D', count: 3, value: 2 },
  { letter: 'E', count: 7, value: 1 },
  { letter: 'Ę', count: 1, value: 5 },
  { letter: 'F', count: 1, value: 5 },
  { letter: 'G', count: 2, value: 3 },
  { letter: 'H', count: 2, value: 3 },
  { letter: 'I', count: 8, value: 1 },
  { letter: 'J', count: 2, value: 3 },
  { letter: 'K', count: 3, value: 2 },
  { letter: 'L', count: 3, value: 2 },
  { letter: 'Ł', count: 2, value: 3 },
  { letter: 'M', count: 3, value: 2 },
  { letter: 'N', count: 5, value: 1 },
  { letter: 'Ń', count: 1, value: 7 },
  { letter: 'O', count: 6, value: 1 },
  { letter: 'Ó', count: 1, value: 5 },
  { letter: 'P', count: 3, value: 2 },
  { letter: 'R', count: 4, value: 1 },
  { letter: 'S', count: 4, value: 1 },
  { letter: 'Ś', count: 1, value: 5 },
  { letter: 'T', count: 3, value: 2 },
  { letter: 'U', count: 2, value: 3 },
  { letter: 'W', count: 4, value: 1 },
  { letter: 'Y', count: 4, value: 2 },
  { letter: 'Z', count: 5, value: 1 },
  { letter: 'Ź', count: 1, value: 9 },
  { letter: 'Ż', count: 1, value: 5 },
  BLANK,
];

export function tilesFor(variant: ScrabbleVariant): TileSpec[] {
  return variant === 'pl' ? PL_TILES : EN_TILES;
}

/** letter → point value (blank/unknown = 0). */
export function letterValues(variant: ScrabbleVariant): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tilesFor(variant)) m.set(t.letter, t.value);
  return m;
}

// ---------------------------------------------------------------------------
// Premium squares
// ---------------------------------------------------------------------------

export type Premium = 'none' | 'dl' | 'tl' | 'dw' | 'tw' | 'center';

// Standard 15×15 layout. T=triple word, D=double word, 3=triple letter,
// 2=double letter, *=centre (scores as double word), .=plain.
const PREMIUM_LAYOUT: readonly string[] = [
  'T..2...T...2..T',
  '.D...3...3...D.',
  '..D...2.2...D..',
  '2..D...2...D..2',
  '....D.....D....',
  '.3...3...3...3.',
  '..2...2.2...2..',
  'T..2...*...2..T',
  '..2...2.2...2..',
  '.3...3...3...3.',
  '....D.....D....',
  '2..D...2...D..2',
  '..D...2.2...D..',
  '.D...3...3...D.',
  'T..2...T...2..T',
];

const PREMIUM_OF: Record<string, Premium> = {
  T: 'tw',
  D: 'dw',
  '3': 'tl',
  '2': 'dl',
  '*': 'center',
  '.': 'none',
};

/** Premium of every cell, row-major length 225. */
export const PREMIUMS: Premium[] = PREMIUM_LAYOUT.flatMap((row) =>
  Array.from(row, (ch) => PREMIUM_OF[ch] ?? 'none'),
);

export function premiumAt(cell: number): Premium {
  return PREMIUMS[cell] ?? 'none';
}

/** Compact single-char marker used in the prompt/board rendering. */
export function premiumMarker(p: Premium): string {
  switch (p) {
    case 'dl':
      return '2';
    case 'tl':
      return '3';
    case 'dw':
      return 'D';
    case 'tw':
      return 'T';
    case 'center':
      return '*';
    default:
      return '.';
  }
}
