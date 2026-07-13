import { describe, expect, it } from 'vitest';

import { detectLocale, localeFromPath, localePath, routeSegment, translatePath } from './index';

describe('localePath', () => {
  it('leaves Polish unprefixed — the canonical URLs never moved', () => {
    expect(localePath('pl', 'arena')).toBe('/');
    expect(localePath('pl', 'rankings')).toBe('/rankingi');
    expect(localePath('pl', 'replay', 'abc-123')).toBe('/replay/abc-123');
  });

  it('prefixes English and translates the segment', () => {
    expect(localePath('en', 'arena')).toBe('/en');
    expect(localePath('en', 'rankings')).toBe('/en/rankings');
    expect(localePath('en', 'replay', 'abc-123')).toBe('/en/replay/abc-123');
  });

  it('keeps a subject id with slashes intact (openrouter:meta-llama/llama-3)', () => {
    expect(localePath('en', 'model', 'openrouter:meta-llama/llama-3')).toBe(
      '/en/model/openrouter:meta-llama/llama-3',
    );
  });
});

describe('localeFromPath', () => {
  it('reads the language off the URL, and only the /en prefix counts', () => {
    expect(localeFromPath('/')).toBe('pl');
    expect(localeFromPath('/rankingi')).toBe('pl');
    expect(localeFromPath('/en')).toBe('en');
    expect(localeFromPath('/en/rankings')).toBe('en');
    // Not a locale prefix — a match id that merely starts with "en".
    expect(localeFromPath('/replay/en0000')).toBe('pl');
    expect(localeFromPath('/enigma')).toBe('pl');
  });
});

describe('translatePath', () => {
  it('maps a page onto the same page in the other language', () => {
    expect(translatePath('/rankingi', 'en')).toBe('/en/rankings');
    expect(translatePath('/en/rankings', 'pl')).toBe('/rankingi');
    expect(translatePath('/porownaj', 'en')).toBe('/en/compare');
    expect(translatePath('/en/intuition', 'pl')).toBe('/intuicja');
  });

  it('preserves params — a shared replay link stays the same match', () => {
    expect(translatePath('/replay/abc-123', 'en')).toBe('/en/replay/abc-123');
    expect(translatePath('/en/replay/abc-123', 'pl')).toBe('/replay/abc-123');
    expect(translatePath('/model/openrouter:meta-llama/llama-3', 'en')).toBe(
      '/en/model/openrouter:meta-llama/llama-3',
    );
  });

  it('is identity when the target is the language already in the path', () => {
    expect(translatePath('/rankingi', 'pl')).toBe('/rankingi');
    expect(translatePath('/en/rankings', 'en')).toBe('/en/rankings');
  });

  it('sends an unknown path (the SPA 404) home rather than inventing a URL', () => {
    expect(translatePath('/nie-ma-takiej-strony', 'en')).toBe('/en');
    expect(translatePath('/en/nope', 'pl')).toBe('/');
  });

  it('maps both roots', () => {
    expect(translatePath('/', 'en')).toBe('/en');
    expect(translatePath('/en', 'pl')).toBe('/');
  });
});

describe('detectLocale', () => {
  it('gives Polish to a Polish browser and English to everyone else', () => {
    expect(detectLocale(['pl-PL', 'en-US'])).toBe('pl');
    expect(detectLocale(['pl'])).toBe('pl');
    expect(detectLocale(['en-US', 'pl'])).toBe('en');
    expect(detectLocale(['de-DE'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});

describe('routeSegment', () => {
  it('gives react-router the segment relative to the locale shell', () => {
    expect(routeSegment('pl', 'rankings')).toBe('rankingi');
    expect(routeSegment('en', 'rankings')).toBe('rankings');
    expect(routeSegment('en', 'arena')).toBe(''); // index route
  });
});
