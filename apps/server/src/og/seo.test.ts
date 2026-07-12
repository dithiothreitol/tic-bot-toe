import { describe, expect, it } from 'vitest';

import {
  STATIC_SITEMAP_URLS,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemap,
  originFrom,
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
});

describe('buildLlmsTxt', () => {
  it('describes the site and its data endpoints for agents', () => {
    const txt = buildLlmsTxt('https://arena.example');
    expect(txt).toContain('# tic-bot-toe');
    expect(txt).toContain('https://arena.example/api/leaderboard');
    expect(txt).toContain('https://arena.example/replay/:id');
  });
});
