import { type Locale, LOCALES, localePath, translatePath } from '@arena/i18n';

/**
 * SEO/OG tags for the SPA shell (SPEC §11), per locale. Pure string helpers so the
 * injection is unit-testable without a browser or a DB; `index.ts` serves the built
 * index.html with these spliced into <head> before the SPA hydrates.
 *
 * Both languages are real URLs (`/replay/:id` and `/en/replay/:id`), so a link
 * pasted into Slack must preview in the language of the link — which is why every
 * builder here takes a `locale`, and why each page declares its `hreflang`
 * alternates.
 */
export interface OgMetaInput {
  id: string;
  game: string;
  variant: string;
  p1Id: string;
  p2Id: string;
  winner: string | null;
}

export interface OgTags {
  title: string;
  description: string;
  image: string;
  url: string;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

const SITE_NAME = 'tic-bot-toe — LLM Game Arena';

const OG_LOCALE: Record<Locale, string> = { pl: 'pl_PL', en: 'en_US' };

function short(id: string): string {
  return id.replace(/^(openrouter|webllm|ollama):/, '');
}

// ---------------------------------------------------------------------------
// The site shell (every page that is not a replay)
// ---------------------------------------------------------------------------

const SITE_COPY: Record<Locale, { description: string; ogDescription: string }> = {
  pl: {
    description:
      'Arena, w której modele językowe i ludzie grają w kółko i krzyżyk oraz statki. Telemetria ruchów, rankingi Elo, Precyzja, wykresy i powtórki — zobacz, czym różnią się modele bez czytania benchmarków.',
    ogDescription:
      'Modele językowe i ludzie grają w kółko i krzyżyk oraz statki. Telemetria, rankingi Elo, Precyzja, wykresy i powtórki.',
  },
  en: {
    description:
      'An arena where language models and humans play tic-tac-toe and battleship. Move telemetry, Elo rankings, Precision, charts and replays — see how models differ without reading a single benchmark.',
    ogDescription:
      'Language models and humans play tic-tac-toe and battleship. Telemetry, Elo rankings, Precision, charts and replays.',
  },
};

/** Default tags for a non-replay page (`/`, `/en`, `/rankingi`, `/en/rankings`, …). */
export function siteOgTags(origin: string, path: string, locale: Locale): OgTags {
  return {
    title: SITE_NAME,
    description: SITE_COPY[locale].ogDescription,
    image: `${origin}/og.png`,
    url: `${origin}${path}`,
  };
}

export function siteStructuredData(origin: string, locale: Locale): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web',
    inLanguage: locale,
    description: SITE_COPY[locale].description,
    url: `${origin}${localePath(locale, 'arena')}`,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

/** The `<meta name="description">` of a non-replay page — longer than the OG one. */
export function siteDescription(locale: Locale): string {
  return SITE_COPY[locale].description;
}

// ---------------------------------------------------------------------------
// A single replay
// ---------------------------------------------------------------------------

const REPLAY_COPY: Record<
  Locale,
  {
    game: (game: string) => string;
    draw: string;
    wins: (who: string) => string;
    fallback: string;
    description: (game: string, variant: string, result: string) => string;
  }
> = {
  pl: {
    game: (game) => (game === 'tictactoe' ? 'kółko i krzyżyk' : 'statki'),
    draw: 'remis',
    wins: (who) => `${who} wygrywa`,
    fallback: 'partia',
    description: (game, variant, result) =>
      `LLM Game Arena · ${game} ${variant} · ${result}. Powtórka krok po kroku.`,
  },
  en: {
    game: (game) => (game === 'tictactoe' ? 'tic-tac-toe' : 'battleship'),
    draw: 'draw',
    wins: (who) => `${who} wins`,
    fallback: 'match',
    description: (game, variant, result) =>
      `LLM Game Arena · ${game} ${variant} · ${result}. A step-by-step replay.`,
  },
};

export function matchOgTags(match: OgMetaInput, baseUrl: string, locale: Locale = 'pl'): OgTags {
  const copy = REPLAY_COPY[locale];
  const p1 = short(match.p1Id);
  const p2 = short(match.p2Id);
  const gameLabel = copy.game(match.game);
  const result =
    match.winner === 'draw'
      ? copy.draw
      : match.winner === 'p1'
        ? copy.wins(p1)
        : match.winner === 'p2'
          ? copy.wins(p2)
          : copy.fallback;
  return {
    title: `${p1} vs ${p2} — ${gameLabel} ${match.variant}`,
    description: copy.description(gameLabel, match.variant, result),
    // The OG image carries text too, so it is rendered in the language of the link.
    image: `${baseUrl}/api/og/${match.id}?lang=${locale}`,
    url: `${baseUrl}${localePath(locale, 'replay', match.id)}`,
  };
}

/** schema.org structured data for a replay (agent-friendly, SPEC intent). */
export function matchStructuredData(
  match: OgMetaInput,
  tags: OgTags,
  locale: Locale = 'pl',
): object {
  const gameLabel = REPLAY_COPY[locale].game(match.game);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: tags.title,
    description: tags.description,
    url: tags.url,
    inLanguage: locale,
    primaryImageOfPage: { '@type': 'ImageObject', url: tags.image, width: 1200, height: 630 },
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: tags.url.replace(/(\/en)?\/replay\/.*$/, '/'),
    },
    about: {
      '@type': 'Game',
      name: `${gameLabel} — ${match.variant}`,
      gameItem: [
        { '@type': 'Thing', name: match.p1Id.replace(/^[^:]+:/, '') },
        { '@type': 'Thing', name: match.p2Id.replace(/^[^:]+:/, '') },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

/**
 * Every language of one page, plus `x-default` pointing at the canonical (Polish)
 * URL — this is what lets a crawler index both without calling them duplicates.
 */
export function alternatesFor(path: string, origin: string): Alternate[] {
  const alts: Alternate[] = LOCALES.map((l) => ({
    hreflang: l,
    href: `${origin}${translatePath(path, l)}`,
  }));
  alts.push({ hreflang: 'x-default', href: `${origin}${translatePath(path, 'pl')}` });
  return alts;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape a string for embedding inside a <script> block (prevent </script> break-out). */
function escJson(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export interface SeoInjection {
  locale: Locale;
  tags: OgTags;
  /** Long-form `<meta name="description">`; falls back to the OG description. */
  description?: string;
  alternates?: Alternate[];
  structuredData?: object;
  /** `article` for a replay, `website` for the rest. */
  ogType?: 'website' | 'article';
}

/**
 * Splice the head of the SPA shell: `<html lang>`, title, description, canonical,
 * hreflang, OG/Twitter and JSON-LD. The shell's own (Polish, static) tags are
 * stripped first, so a page always carries exactly ONE set — otherwise an English
 * page would ship a Polish og:title next to its English one.
 */
export function injectSeo(html: string, inj: SeoInjection): string {
  const { locale, tags } = inj;
  const title = esc(tags.title);
  const ogDesc = esc(tags.description);
  const metaDesc = esc(inj.description ?? tags.description);
  const img = esc(tags.image);
  const url = esc(tags.url);

  const lines = [
    `<title>${title}</title>`,
    `<meta name="description" content="${metaDesc}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    ...(inj.alternates ?? []).map(
      (a) => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}" />`,
    ),
    `<meta property="og:type" content="${inj.ogType ?? 'website'}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[locale]}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${ogDesc}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${ogDesc}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ];
  if (inj.structuredData) {
    lines.push(
      `<script type="application/ld+json">${escJson(JSON.stringify(inj.structuredData))}</script>`,
    );
  }
  const block = lines.join('\n    ');

  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(
      /[ \t]*<meta[^>]+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description"|name="robots")[^>]*>\s*/gi,
      '',
    )
    .replace(/[ \t]*<link[^>]+rel="(?:canonical|alternate)"[^>]*>\s*/gi, '')
    .replace(/[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<html([^>]*)\slang="[^"]*"/i, `<html$1 lang="${locale}"`);

  return cleaned.replace(/<\/head>/i, `    ${block}\n  </head>`);
}
