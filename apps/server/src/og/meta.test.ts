import { describe, expect, it } from 'vitest';

import { injectOgMeta, matchOgTags, matchStructuredData } from './meta';

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
    expect(tags.image).toBe('https://arena.example/api/og/abc-123');
    expect(tags.url).toBe('https://arena.example/replay/abc-123');
  });
});

describe('injectOgMeta', () => {
  const html = '<!doctype html><html><head><title>old</title></head><body></body></html>';

  it('replaces the title and injects OG + canonical + JSON-LD before </head>', () => {
    const tags = matchOgTags(MATCH, 'https://arena.example');
    const out = injectOgMeta(html, tags, matchStructuredData(MATCH, tags));
    expect(out).not.toContain('<title>old</title>');
    expect(out).toContain('<title>claude-opus-4 vs gpt-5 — kółko i krzyżyk standard</title>');
    expect(out).toContain('<link rel="canonical" href="https://arena.example/replay/abc-123" />');
    expect(out).toContain('property="og:image" content="https://arena.example/api/og/abc-123"');
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
    expect(out).toContain('application/ld+json');
    expect(out).toContain('"@type":"WebPage"');
    // The injected block sits inside <head>.
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'));
  });

  it('strips the shell default SEO tags so there is exactly one og:title', () => {
    const shell =
      '<html><head><title>tic-bot-toe</title>' +
      '<meta name="description" content="default" />' +
      '<meta property="og:title" content="default" />' +
      '<meta property="og:image" content="/og.png" />' +
      '<link rel="canonical" href="/" />' +
      '<meta name="twitter:card" content="summary_large_image" />' +
      '</head><body></body></html>';
    const tags = matchOgTags(MATCH, 'https://x');
    const out = injectOgMeta(shell, tags);
    expect((out.match(/property="og:title"/g) ?? []).length).toBe(1);
    expect((out.match(/rel="canonical"/g) ?? []).length).toBe(1);
    expect(out).not.toContain('content="default"');
  });

  it('escapes </script> and angle brackets in JSON-LD to prevent break-out', () => {
    const tags = matchOgTags({ ...MATCH, p1Id: 'openrouter:</script>evil' }, 'https://x');
    const out = injectOgMeta(html, tags, matchStructuredData({ ...MATCH, p1Id: 'openrouter:</script>evil' }, tags));
    expect(out).not.toContain('</script>evil');
    expect(out).toContain('\\u003c');
  });
});
