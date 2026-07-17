import { describe, expect, it } from 'vitest';

import {
  STATIC_SITEMAP_URLS,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemap,
  originFrom,
  replaySitemapUrls,
} from './seo';

describe('originFrom', () => {
  it('defaults to https and ignores XFP unless behind a trusted proxy', () => {
    expect(originFrom('arena.example', 'http', false)).toBe('https://arena.example');
    expect(originFrom('arena.example', 'http', true)).toBe('http://arena.example');
    expect(originFrom(undefined, undefined, true)).toBe('https://localhost');
  });
});

describe('buildRobotsTxt', () => {
  it('allows all, welcomes AI agents, and points to the sitemap', () => {
    const txt = buildRobotsTxt('https://arena.example');
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('User-agent: GPTBot');
    expect(txt).toContain('User-agent: ClaudeBot');
    expect(txt).toContain('Sitemap: https://arena.example/sitemap.xml');
  });
});

describe('buildSitemap', () => {
  it('emits valid urlset XML with absolute locs and escapes ampersands', () => {
    const xml = buildSitemap('https://arena.example', [
      ...STATIC_SITEMAP_URLS,
      { path: '/replay/a&b', priority: 0.5, lastmod: '2026-07-12' },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<loc>https://arena.example/</loc>');
    expect(xml).toContain('<loc>https://arena.example/rankingi</loc>');
    expect(xml).toContain('/replay/a&amp;b');
    expect(xml).toContain('<lastmod>2026-07-12</lastmod>');
  });

  it('lists every static page in both languages', () => {
    const paths = STATIC_SITEMAP_URLS.map((u) => u.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/', '/rankingi', '/porownaj', '/muzeum-wpadek',
        '/en', '/en/rankings', '/en/compare', '/en/fail-museum',
      ]),
    );
  });

  it('declares the hreflang alternates, so the two languages are one page — not duplicates', () => {
    const xml = buildSitemap('https://arena.example', [{ path: '/rankingi' }]);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://arena.example/en/rankings" />',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://arena.example/rankingi" />',
    );
  });
});

describe('replaySitemapUrls', () => {
  it('publishes a replay under both languages, Polish canonical', () => {
    const urls = replaySitemapUrls('abc-123', '2026-07-12');
    expect(urls.map((u) => u.path)).toEqual(['/replay/abc-123', '/en/replay/abc-123']);
    expect(urls[0].priority).toBeGreaterThan(urls[1].priority!);
    expect(urls.every((u) => u.lastmod === '2026-07-12')).toBe(true);
  });
});

describe('buildLlmsTxt', () => {
  it('describes the site and its data endpoints for agents', () => {
    const txt = buildLlmsTxt('https://arena.example');
    expect(txt).toContain('# tic-bot-toe');
    expect(txt).toContain('https://arena.example/api/leaderboard');
    expect(txt).toContain('https://arena.example/replay/:id');
  });

  it('tells an agent that the site exists in English too, and where', () => {
    const txt = buildLlmsTxt('https://arena.example');
    expect(txt).toContain('https://arena.example/en/rankings');
    expect(txt).toContain('English lives under');
    // Prompts stay English regardless of the UI language — worth saying to an agent.
    expect(txt).toContain('prompts sent to the models are always English');
  });
});
