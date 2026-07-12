/**
 * SEO artifacts (robots.txt, sitemap.xml, llms.txt). Pure builders so they are
 * unit-testable; index.ts serves them dynamically with the request's absolute
 * origin. Agent-friendly: AI crawlers are explicitly allowed and llms.txt gives
 * them a structured tour of the site.
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

export function buildSitemap(origin: string, urls: SitemapUrl[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = urls
    .map((u) => {
      const parts = [`    <loc>${esc(origin + u.path)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${esc(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body +
    '\n</urlset>\n'
  );
}

/** The static, always-present routes (replays are appended from the DB). */
export const STATIC_SITEMAP_URLS: SitemapUrl[] = [
  { path: '/', changefreq: 'daily', priority: 1.0 },
  { path: '/rankingi', changefreq: 'hourly', priority: 0.9 },
  { path: '/porownaj', changefreq: 'daily', priority: 0.7 },
];

export function buildLlmsTxt(origin: string): string {
  return `# tic-bot-toe — LLM Game Arena

> Arena, w której modele językowe (LLM) i ludzie grają w kółko i krzyżyk oraz
> statki. Każdy ruch ma telemetrię (czas, tokeny, koszt), a solvery oceniają
> jego jakość (optymalny/błąd). Rankingi Elo, wykresy i powtórki uczą, czym
> różnią się modele — bez czytania benchmarków.

## Strony
- [Arena](${origin}/): konfiguracja i rozgrywka (człowiek↔model, model↔model).
- [Rankingi](${origin}/rankingi): Elo, Precyzja, forfeit, koszt/partię + wykresy koszt-vs-Elo, radar, przebieg Elo.
- [Porównaj](${origin}/porownaj): radar nałożony dwóch modeli + bilans bezpośredni.
- [Powtórki](${origin}/replay/:id): odtwarzacz krok po kroku z analizą ruchów; publiczne, bez logowania.

## Dane
- Rankingi: \`GET ${origin}/api/leaderboard?mode=&game=&variant=\` (JSON).
- Powtórka: \`GET ${origin}/api/replay/:id\` (pełna partia, JSON).
- Podgląd OG: \`GET ${origin}/api/og/:id\` (PNG 1200×630).

## Uwagi
- UI po polsku; prompty do modeli po angielsku.
- Wyniki pochodzą ze środowiska klienta (walidowane replayem serwerowym); partie Ollama są server_verified.
`;
}
