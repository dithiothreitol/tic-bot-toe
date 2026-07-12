/**
 * Nickname rules for the human leaderboard (SPEC §10/§16). "Prosty filtr
 * wulgaryzmów" — a small substring blocklist over a normalized form; not a
 * content-moderation system. Nicknames are lowercased for storage + uniqueness.
 */

/** 3–20 chars, letters (incl. Polish), digits, `_` and `-`. */
const NICKNAME_RE = /^[a-z0-9ąćęłńóśźż_-]{3,20}$/;

/** Small PL/EN blocklist, matched as a substring after normalization. */
const BLOCKLIST = [
  'kurwa', 'chuj', 'chuja', 'chuju', 'huj', 'pizda', 'pizdy', 'jebac', 'jebał',
  'jeba', 'jebany', 'pierdol', 'pierdolic', 'skurwiel', 'skurwysyn', 'debil',
  'idiota', 'cwel', 'dziwka', 'szmata', 'gnoj', 'zjeb', 'wypierdalaj',
  'fuck', 'fucker', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'nigger',
  'nigga', 'faggot', 'whore', 'slut', 'rape', 'nazi', 'hitler',
];

export type NicknameError = 'invalid_format' | 'profanity';

/** Normalize for storage + uniqueness: trim, lowercase. */
export function normalizeNickname(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validate a raw nickname. Returns the normalized value or a reason code.
 * Profanity check maps Polish diacritics to ASCII so `chój`≈`chuj` still trips.
 */
export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; error: NicknameError } {
  const value = normalizeNickname(raw);
  if (!NICKNAME_RE.test(value)) return { ok: false, error: 'invalid_format' };
  const ascii = value
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
  if (BLOCKLIST.some((bad) => ascii.includes(bad))) return { ok: false, error: 'profanity' };
  return { ok: true, value };
}
