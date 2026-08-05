/**
 * Every word that appears on a certificate, per locale (plan §6.0).
 *
 * TONE — read this before editing a single line.
 *
 * The document is a straight-faced parody of the "AI transformation / scaling /
 * strategy" course certificate. The exaggeration lives ENTIRELY in the titles
 * and the framing; every number it states (opponent, game, date, move count,
 * streak, hash) comes from the database and is replayable move by move. That
 * contrast is the joke. Inflate a fact and the document stops being funny and
 * starts being a lie.
 *
 * Each gag fires EXACTLY ONCE, in a different slot, at a different sin of the
 * genre: attendance-instead-of-results (the formula), "learning outcomes" that
 * are just a description of what happened (the list), course infrastructure that
 * never existed (the duration), accreditation and funnels (the disclaimer).
 * Repeating one — slides three times, webinars twice — is what turns this from
 * dry into try-hard, and it is the single most likely way to break it.
 *
 * The English is WRITTEN, not translated: Polish mocks "wdrożenia i synergie",
 * English mocks the "transformation journey". A literal translation of either
 * lands flat. `copy.test.ts` guards both rules.
 *
 * The document copy lives here and not in apps/web/src/i18n because the server
 * cannot import from the web app — same reason as `CARD_COPY` in og/render.ts.
 */
import type { GameId } from '@arena/game-core';
import type { Locale } from '@arena/i18n';

const PL_MONTHS = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `2026-07-12` → `12 lipca 2026`. Hand-rolled: no dependency on the ICU build. */
function formatDay(day: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const [, year, month, dayOfMonth] = m;
  const names = locale === 'pl' ? PL_MONTHS : EN_MONTHS;
  const name = names[Number(month) - 1] ?? month;
  return `${Number(dayOfMonth)} ${name} ${year}`;
}

/**
 * Polish move count: 1 ruch, 2–4 ruchy, 5+ ruchów — with the 12–14 exception
 * that catches every naive implementation.
 */
function plMoves(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (n === 1) return '1 ruch';
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} ruchy`;
  return `${n} ruchów`;
}

export interface CertificateCopy {
  kicker: string;
  title: string;
  subtitle: string;
  formula: string;
  lead: string;
  condition: string;
  outcomesHeader: string;
  outcomeGame: (game: string, variant: string | null) => string;
  outcomeMoves: (moves: number) => string;
  outcomeStreak: (days: number) => string;
  outcomeSolo: string;
  duration: readonly [string, string];
  signature: string;
  verify: (url: string) => string;
  disclaimer: readonly [string, string, string];
  anonymous: string;
  /** Shown under an anonymous name — the nudge to claim a nickname. */
  anonymousHint: string;
  streakBadge: (days: number) => string;
  seal: (matchId: string, hash: string) => string;
  wordmark: string;
  date: (day: string) => string;
  game: (game: GameId) => string;
  /** Social card. */
  shareKicker: string;
  shareHeadline: readonly [string, string, string];
  shareFacts: (opponent: string, game: string, variant: string | null, moves: number) => string;
  shareBottom: (moves: number) => string;
  shareAlt: (name: string, opponent: string) => string;
  /** PDF document metadata. */
  pdfTitle: (name: string) => string;
  pdfSubject: (opponent: string, day: string) => string;
}

const gameLabelPl = (g: GameId): string =>
  g === 'tictactoe'
    ? 'Kółko i krzyżyk'
    : g === 'sudoku'
      ? 'Sudoku Duel'
      : g === 'scrabble'
        ? 'Słowna bitwa'
        : 'Statki';

const gameLabelEn = (g: GameId): string =>
  g === 'tictactoe'
    ? 'Tic-tac-toe'
    : g === 'sudoku'
      ? 'Sudoku Duel'
      : g === 'scrabble'
        ? 'Word Battle'
        : 'Battleship';

const withVariant = (game: string, variant: string | null): string =>
  variant ? `${game} ${variant}` : game;

export const CERTIFICATE_COPY: Record<Locale, CertificateCopy> = {
  pl: {
    kicker: 'AKADEMIA STRATEGII AI · EDYCJA CODZIENNA',
    title: 'CERTYFIKAT UKOŃCZENIA KURSU STRATEGII AI',
    subtitle: 'poziom zaawansowany · moduł praktyczny',
    formula: 'Niniejszym zaświadcza się, na podstawie wyniku, a nie obecności, że',
    lead: 'ukończył(a) pełny program szkoleniowy, pokonując model',
    condition: 'w partii rozegranej na żywo, bez cofania ruchów',
    outcomesHeader: 'EFEKTY KSZTAŁCENIA',
    outcomeGame: (game, variant) => `Wdrożenie strategii AI: ${withVariant(game, variant)}`,
    outcomeMoves: (moves) => `Skalowanie przewagi: ${plMoves(moves)} — każdy odtworzony przez serwer`,
    outcomeStreak: (days) => `Utrzymanie transformacji: ${days} dni z rzędu`,
    outcomeSolo: 'Time-to-value: jedna partia',
    duration: ['Czas trwania kursu: jedna partia. Materiały: brak.', 'Webinar: nie odbył się.'],
    signature: 'Wydział Zastosowań Praktycznych · tic-bot-toe',
    verify: (url) => `Zweryfikuj każdy ruch: ${url}`,
    disclaimer: [
      'Certyfikat nieakredytowany i nieakredytowalny. Nie uprawnia do prowadzenia szkoleń, prelekcji ani wątków na LinkedInie.',
      'Nie zawiera lejka sprzedażowego. Wszystkie dane powyżej są prawdziwe i możliwe do odtworzenia —',
      'to jedyna rzecz, która odróżnia go od pozostałych.',
    ],
    anonymous: 'Anonimowy gracz areny',
    anonymousHint: 'ustaw nick w ustawieniach, aby podpisać kolejne certyfikaty',
    streakBadge: (days) => `SERIA ${days} DNI`,
    seal: (matchId, hash) => `partia ${matchId} · pieczęć ${hash}`,
    wordmark: 'tic-bot-toe · LLM Game Arena',
    date: (day) => formatDay(day, 'pl'),
    game: gameLabelPl,
    shareKicker: 'KURS STRATEGII AI — UKOŃCZONY',
    shareHeadline: [
      'ma certyfikat strategii AI.',
      'Kurs trwał jedną partię',
      'i polegał na wygranej z modelem.',
    ],
    shareFacts: (opponent, game, variant, moves) =>
      `${opponent} · ${withVariant(game, variant)} · ${plMoves(moves)}`,
    shareBottom: (moves) => `${plMoves(moves)} · wszystkie do odtworzenia pod tym linkiem`,
    shareAlt: (name, opponent) =>
      `Certyfikat: ${name} pokonał model ${opponent} w wyzwaniu dnia areny tic-bot-toe.`,
    pdfTitle: (name) => `Certyfikat ukończenia kursu strategii AI — ${name}`,
    pdfSubject: (opponent, day) => `Wyzwanie dnia ${day}: wygrana z modelem ${opponent}.`,
  },
  en: {
    kicker: 'AI STRATEGY ACADEMY · DAILY COHORT',
    title: 'CERTIFICATE OF COMPLETION — AI STRATEGY',
    subtitle: 'advanced level · hands-on module',
    formula: 'This is to certify, on results rather than attendance, that',
    lead: 'completed the full training programme by defeating',
    condition: 'in a live match, with no takebacks',
    outcomesHeader: 'LEARNING OUTCOMES',
    outcomeGame: (game, variant) => `AI strategy deployment: ${withVariant(game, variant)}`,
    outcomeMoves: (moves) => `Scaling the advantage: ${moves} moves, every one server-replayed`,
    outcomeStreak: (days) => `Sustaining the transformation: ${days} days running`,
    outcomeSolo: 'Time-to-value: a single match',
    duration: ['Course length: one match. Materials: none.', 'Webinar: never happened.'],
    signature: 'Faculty of Things That Actually Happened · tic-bot-toe',
    verify: (url) => `Verify every move: ${url}`,
    disclaimer: [
      'Unaccredited and unaccreditable. Confers no right to run workshops, keynotes or LinkedIn threads.',
      'Contains no sales funnel. Every figure above is real and independently replayable —',
      'which is the only thing separating it from the rest.',
    ],
    anonymous: 'Anonymous arena player',
    anonymousHint: 'set a nickname in settings to sign your next certificate',
    streakBadge: (days) => `${days}-DAY STREAK`,
    seal: (matchId, hash) => `match ${matchId} · seal ${hash}`,
    wordmark: 'tic-bot-toe · LLM Game Arena',
    date: (day) => formatDay(day, 'en'),
    game: gameLabelEn,
    shareKicker: 'AI STRATEGY COURSE — COMPLETED',
    shareHeadline: [
      'has an AI strategy certificate.',
      'The course lasted one match',
      'and consisted of beating a model.',
    ],
    shareFacts: (opponent, game, variant, moves) =>
      `${opponent} · ${withVariant(game, variant)} · ${moves} moves`,
    shareBottom: (moves) => `${moves} moves · every one replayable at this link`,
    shareAlt: (name, opponent) =>
      `Certificate: ${name} beat ${opponent} in the tic-bot-toe arena daily challenge.`,
    pdfTitle: (name) => `AI Strategy Certificate of Completion — ${name}`,
    pdfSubject: (opponent, day) => `Daily challenge ${day}: a win over ${opponent}.`,
  },
};
