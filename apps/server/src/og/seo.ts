import { type RouteKey, LOCALES, localePath } from '@arena/i18n';

import { alternatesFor } from './meta';

/**
 * SEO artifacts (robots.txt, sitemap.xml, llms.txt). Pure builders so they are
 * unit-testable; index.ts serves them dynamically with the request's absolute
 * origin. Agent-friendly: AI crawlers are explicitly allowed and llms.txt gives
 * them a structured tour of the site — in both languages.
 */

/** `${proto}://${host}` from request headers, trusting XFP only behind a proxy. */
export function originFrom(
  host: string | undefined,
  forwardedProto: string | undefined,
  trustedProxy: boolean,
): string {
  const h = host ?? 'localhost';
  const proto = trustedProxy && forwardedProto ? forwardedProto.split(',')[0].trim() : 'https';
  return `${proto}://${h}`;
}

/** AI/agent crawlers we explicitly welcome (agent-friendly, SPEC intent). */
const AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'Meta-ExternalAgent',
];

export function buildRobotsTxt(origin: string): string {
  const lines = [
    '# tic-bot-toe — LLM Game Arena',
    'User-agent: *',
    'Allow: /',
    '',
    '# AI / agent crawlers are welcome to read and cite this site.',
    ...AI_AGENTS.flatMap((ua) => [`User-agent: ${ua}`, 'Allow: /']),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
  ];
  return lines.join('\n') + '\n';
}

export interface SitemapUrl {
  path: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  priority?: number;
  lastmod?: string; // ISO date
}

/**
 * Every URL is emitted once per language, and each entry lists the others as
 * `xhtml:link` alternates — without that, a crawler sees `/rankingi` and
 * `/en/rankings` as two pages competing for the same content instead of one page
 * in two languages.
 */
export function buildSitemap(origin: string, urls: SitemapUrl[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = urls
    .map((u) => {
      const parts = [`    <loc>${esc(origin + u.path)}</loc>`];
      for (const alt of alternatesFor(u.path, origin)) {
        parts.push(
          `    <xhtml:link rel="alternate" hreflang="${esc(alt.hreflang)}" href="${esc(alt.href)}" />`,
        );
      }
      if (u.lastmod) parts.push(`    <lastmod>${esc(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    body +
    '\n</urlset>\n'
  );
}

/** The pages that exist regardless of the DB, in every language. */
const STATIC_PAGES: { key: RouteKey; changefreq: SitemapUrl['changefreq']; priority: number }[] = [
  { key: 'arena', changefreq: 'daily', priority: 1.0 },
  { key: 'rankings', changefreq: 'hourly', priority: 0.9 },
  { key: 'compare', changefreq: 'daily', priority: 0.7 },
  { key: 'failures', changefreq: 'daily', priority: 0.6 },
  { key: 'turing', changefreq: 'daily', priority: 0.6 },
];

/** The static, always-present routes (replays are appended from the DB). */
export const STATIC_SITEMAP_URLS: SitemapUrl[] = LOCALES.flatMap((locale) =>
  STATIC_PAGES.map(({ key, changefreq, priority }) => ({
    path: localePath(locale, key),
    changefreq,
    // The unprefixed Polish URL is canonical; the English one is not a lesser page,
    // but it must not outrank its own canonical.
    priority: locale === 'pl' ? priority : Math.max(0.1, priority - 0.1),
  })),
);

/** One replay, in both languages (the OG card and the UI follow the URL). */
export function replaySitemapUrls(id: string, lastmod: string): SitemapUrl[] {
  return LOCALES.map((locale) => ({
    path: localePath(locale, 'replay', id),
    changefreq: 'monthly' as const,
    priority: locale === 'pl' ? 0.5 : 0.4,
    lastmod,
  }));
}

export function buildLlmsTxt(origin: string): string {
  return `# tic-bot-toe — LLM Game Arena

> Arena, w której modele językowe (LLM) i ludzie grają w kółko i krzyżyk,
> statki oraz Sudoku Duel. Każdy ruch ma telemetrię (czas, tokeny, koszt), a
> solvery oceniają jego jakość (optymalny/błąd). Rankingi Elo, wykresy i
> powtórki uczą, czym różnią się modele — bez czytania benchmarków.
>
> An arena where language models (LLMs) and humans play tic-tac-toe,
> battleship and Sudoku Duel. Every move carries telemetry (latency, tokens,
> cost) and is graded by a solver (optimal/blunder). Elo rankings, charts and
> replays teach how models differ — without reading a single benchmark.

## Języki / Languages
Każda strona istnieje w dwóch językach. Polski jest kanoniczny i nieprefiksowany;
angielski żyje pod \`/en\`. Each page exists in two languages: Polish is canonical
and unprefixed, English lives under \`/en\`.

## Strony (PL)
- [Arena](${origin}/): konfiguracja i rozgrywka (człowiek↔model, model↔model).
- [Rankingi](${origin}/rankingi): Elo, Precyzja, forfeit, koszt/partię + wykresy koszt-vs-Elo, radar, przebieg Elo.
- [Porównaj](${origin}/porownaj): radar nałożony dwóch modeli + bilans bezpośredni.
- [Powtórki](${origin}/replay/:id): odtwarzacz krok po kroku z analizą ruchów; publiczne, bez logowania.

## Pages (EN)
- [Arena](${origin}/en): set up and play a match (human↔model, model↔model).
- [Rankings](${origin}/en/rankings): Elo, Precision, forfeits, cost/match + cost-vs-Elo, radar and Elo-over-time charts.
- [Compare](${origin}/en/compare): two models on one radar + their head-to-head record.
- [Replays](${origin}/en/replay/:id): step-by-step player with move analysis; public, no login.

## Dane / Data
- Rankingi / rankings: \`GET ${origin}/api/leaderboard?mode=&game=&variant=\` (JSON).
- Powtórka / replay: \`GET ${origin}/api/replay/:id\` (full match, JSON).
- Podgląd OG / OG preview: \`GET ${origin}/api/og/:id?lang=pl|en\` (PNG 1200×630).

## Uwagi / Notes
- UI po polsku i po angielsku; prompty do modeli zawsze po angielsku.
- The UI is Polish and English; prompts sent to the models are always English.
- Wyniki pochodzą ze środowiska klienta (walidowane replayem serwerowym); partie Ollama są server_verified.
- Results come from the client environment (validated by a server-side replay); Ollama matches are server_verified.
`;
}
