/**
 * OG meta tags for /replay/:id (SPEC §11). Pure string helpers so the injection
 * is unit-testable without a browser or DB. index.ts serves the built
 * index.html with these tags spliced into <head> before the SPA hydrates.
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

function short(id: string): string {
  return id.replace(/^(openrouter|webllm|ollama):/, '');
}

export function matchOgTags(match: OgMetaInput, baseUrl: string): OgTags {
  const p1 = short(match.p1Id);
  const p2 = short(match.p2Id);
  const gameLabel = match.game === 'tictactoe' ? 'kółko i krzyżyk' : 'statki';
  const result =
    match.winner === 'draw'
      ? 'remis'
      : match.winner === 'p1'
        ? `${p1} wygrywa`
        : match.winner === 'p2'
          ? `${p2} wygrywa`
          : 'partia';
  return {
    title: `${p1} vs ${p2} — ${gameLabel} ${match.variant}`,
    description: `LLM Game Arena · ${gameLabel} ${match.variant} · ${result}. Powtórka krok po kroku.`,
    image: `${baseUrl}/api/og/${match.id}`,
    url: `${baseUrl}/replay/${match.id}`,
  };
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

/** schema.org structured data for a replay (agent-friendly, SPEC intent). */
export function matchStructuredData(match: OgMetaInput, tags: OgTags): object {
  const gameLabel = match.game === 'tictactoe' ? 'kółko i krzyżyk' : 'statki';
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: tags.title,
    description: tags.description,
    url: tags.url,
    inLanguage: 'pl',
    primaryImageOfPage: { '@type': 'ImageObject', url: tags.image, width: 1200, height: 630 },
    isPartOf: {
      '@type': 'WebSite',
      name: 'tic-bot-toe — LLM Game Arena',
      url: tags.url.replace(/\/replay\/.*$/, '/'),
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

/**
 * Splice OG/Twitter meta + canonical + <title> (+ optional JSON-LD) into the
 * <head> of the SPA shell. `robots` defaults to indexable.
 */
export function injectOgMeta(
  html: string,
  tags: OgTags,
  structuredData?: object,
): string {
  const t = esc(tags.title);
  const d = esc(tags.description);
  const img = esc(tags.image);
  const url = esc(tags.url);
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="tic-bot-toe — LLM Game Arena" />`,
    `<meta property="og:locale" content="pl_PL" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ];
  if (structuredData) {
    lines.push(
      `<script type="application/ld+json">${escJson(JSON.stringify(structuredData))}</script>`,
    );
  }
  const block = lines.join('\n    ');

  // Strip the shell's default SEO tags so the replay page carries exactly one
  // set (no duplicate og:/twitter:/canonical/title), then inject before </head>.
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/[ \t]*<meta[^>]+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description"|name="robots")[^>]*>\s*/gi, '')
    .replace(/[ \t]*<link[^>]+rel="canonical"[^>]*>\s*/gi, '');
  return cleaned.replace(/<\/head>/i, `    ${block}\n  </head>`);
}
