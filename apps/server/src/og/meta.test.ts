import { describe, expect, it } from 'vitest';

import {
  alternatesFor,
  injectSeo,
  matchOgTags,
  matchStructuredData,
  siteOgTags,
  siteStructuredData,
} from './meta';

const MATCH = {
  id: 'abc-123',
  game: 'tictactoe',
  variant: 'standard',
  p1Id: 'openrouter:claude-opus-4',
  p2Id: 'openrouter:gpt-5',
  winner: 'p1' as const,
};

describe('matchOgTags', () => {
  it('builds a titled, absolute-URL tag set from the match', () => {
    const tags = matchOgTags(MATCH, 'https://arena.example');
    expect(tags.title).toBe('claude-opus-4 vs gpt-5 — kółko i krzyżyk standard');
    expect(tags.description).toContain('claude-opus-4 wygrywa');
    expect(tags.image).toBe('https://arena.example/api/og/abc-123?lang=pl');
    expect(tags.url).toBe('https://arena.example/replay/abc-123');
  });

  it('describes the same match in English, on the English URL and card', () => {
    const tags = matchOgTags(MATCH, 'https://arena.example', 'en');
    expect(tags.title).toBe('claude-opus-4 vs gpt-5 — tic-tac-toe standard');
    expect(tags.description).toContain('claude-opus-4 wins');
    expect(tags.image).toBe('https://arena.example/api/og/abc-123?lang=en');
    expect(tags.url).toBe('https://arena.example/en/replay/abc-123');
  });

  it('marks the language in the structured data', () => {
    const en = matchOgTags(MATCH, 'https://x', 'en');
    expect(matchStructuredData(MATCH, en, 'en')).toMatchObject({ inLanguage: 'en' });
    // The site link must not keep the /en/replay/... tail.
    expect(matchStructuredData(MATCH, en, 'en')).toMatchObject({
      isPartOf: { url: 'https://x/' },
    });
  });
});

describe('alternatesFor', () => {
  it('lists both languages plus an x-default pointing at the canonical URL', () => {
    expect(alternatesFor('/rankingi', 'https://x')).toEqual([
      { hreflang: 'pl', href: 'https://x/rankingi' },
      { hreflang: 'en', href: 'https://x/en/rankings' },
      { hreflang: 'x-default', href: 'https://x/rankingi' },
    ]);
  });

  it('keeps the params of a replay URL when crossing languages', () => {
    expect(alternatesFor('/en/replay/abc-123', 'https://x')).toContainEqual({
      hreflang: 'pl',
      href: 'https://x/replay/abc-123',
    });
  });
});

describe('injectSeo', () => {
  const html = '<!doctype html><html lang="pl"><head><title>old</title></head><body></body></html>';

  it('replaces the title and injects OG + canonical + JSON-LD before </head>', () => {
    const tags = matchOgTags(MATCH, 'https://arena.example');
    const out = injectSeo(html, {
      locale: 'pl',
      tags,
      structuredData: matchStructuredData(MATCH, tags),
      ogType: 'article',
    });
    expect(out).not.toContain('<title>old</title>');
    expect(out).toContain('<title>claude-opus-4 vs gpt-5 — kółko i krzyżyk standard</title>');
    expect(out).toContain('<link rel="canonical" href="https://arena.example/replay/abc-123" />');
    expect(out).toContain('property="og:image" content="https://arena.example/api/og/abc-123?lang=pl"');
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
    expect(out).toContain('application/ld+json');
    expect(out).toContain('"@type":"WebPage"');
    // The injected block sits inside <head>.
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'));
  });

  it('rewrites <html lang> and og:locale for an English page', () => {
    const out = injectSeo('<html lang="pl" class="dark"><head></head></html>', {
      locale: 'en',
      tags: siteOgTags('https://x', '/en', 'en'),
      alternates: alternatesFor('/en', 'https://x'),
      structuredData: siteStructuredData('https://x', 'en'),
    });
    expect(out).toContain('<html lang="en" class="dark">');
    expect(out).toContain('property="og:locale" content="en_US"');
    expect(out).toContain('<link rel="alternate" hreflang="en" href="https://x/en" />');
    expect(out).toContain('<link rel="alternate" hreflang="x-default" href="https://x/" />');
    expect(out).toContain('"inLanguage":"en"');
  });

  it('strips the shell default SEO tags so there is exactly one og:title', () => {
    const shell =
      '<html lang="pl"><head><title>tic-bot-toe</title>' +
      '<meta name="description" content="default" />' +
      '<meta property="og:title" content="default" />' +
      '<meta property="og:image" content="/og.png" />' +
      '<link rel="canonical" href="/" />' +
      '<meta name="twitter:card" content="summary_large_image" />' +
      '<script type="application/ld+json">{"@type":"WebApplication"}</script>' +
      '</head><body></body></html>';
    const tags = matchOgTags(MATCH, 'https://x');
    const out = injectSeo(shell, { locale: 'pl', tags });
    expect((out.match(/property="og:title"/g) ?? []).length).toBe(1);
    expect((out.match(/rel="canonical"/g) ?? []).length).toBe(1);
    expect(out).not.toContain('content="default"');
    // The shell's own JSON-LD is gone; a replay must not carry the site's.
    expect(out).not.toContain('WebApplication');
  });

  it('escapes </script> and angle brackets in JSON-LD to prevent break-out', () => {
    const evil = { ...MATCH, p1Id: 'openrouter:</script>evil' };
    const tags = matchOgTags(evil, 'https://x');
    const out = injectSeo(html, { locale: 'pl', tags, structuredData: matchStructuredData(evil, tags) });
    expect(out).not.toContain('</script>evil');
    expect(out).toContain('\\u003c');
  });
});
