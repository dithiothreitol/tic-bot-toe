/**
 * Locales and the localized URL shape — the one thing the web app and the server
 * MUST agree on.
 *
 * Polish keeps the bare paths it always had (`/rankingi`), so every link ever
 * shared stays valid; English lives under an `/en` prefix with English segments
 * (`/en/rankings`). The front end builds its links from this table and the server
 * builds the sitemap, the hreflang alternates and the per-locale OG tags from the
 * same one — which is why it is a package and not a copy on each side.
 */
export type Locale = 'pl' | 'en';

export const LOCALES: readonly Locale[] = ['pl', 'en'];

/** The unprefixed, canonical language. */
export const DEFAULT_LOCALE: Locale = 'pl';

export function isLocale(value: unknown): value is Locale {
  return value === 'pl' || value === 'en';
}

export type RouteKey = 'arena' | 'rankings' | 'compare' | 'intuition' | 'model' | 'replay';

/** Path segment under the locale root. Empty string = the locale root itself. */
const SEGMENTS: Record<Locale, Record<RouteKey, string>> = {
  pl: {
    arena: '',
    rankings: 'rankingi',
    compare: 'porownaj',
    intuition: 'intuicja',
    model: 'model',
    replay: 'replay',
  },
  en: {
    arena: '',
    rankings: 'rankings',
    compare: 'compare',
    intuition: 'intuition',
    model: 'model',
    replay: 'replay',
  },
};

export const LOCALE_PREFIX: Record<Locale, string> = { pl: '', en: '/en' };

export const ROUTE_KEYS = Object.keys(SEGMENTS.pl) as RouteKey[];

/** Absolute path for a page in a locale. `rest` carries params (`:id`, splat). */
export function localePath(locale: Locale, key: RouteKey, rest = ''): string {
  const segment = SEGMENTS[locale][key];
  const tail = rest ? `/${rest.replace(/^\/+/, '')}` : '';
  const path = `${LOCALE_PREFIX[locale]}${segment ? `/${segment}` : ''}${tail}`;
  return path === '' ? '/' : path;
}

/** The segment as react-router declares it, relative to the locale's shell route. */
export function routeSegment(locale: Locale, key: RouteKey): string {
  return SEGMENTS[locale][key];
}

export function localeFromPath(pathname: string): Locale {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'pl';
}

/** Same page, other language: `/rankingi` ⇄ `/en/rankings`, params preserved. */
export function translatePath(pathname: string, target: Locale): string {
  const from = localeFromPath(pathname);
  const stripped = from === 'en' ? pathname.slice(LOCALE_PREFIX.en.length) || '/' : pathname;
  const [, head = '', ...rest] = stripped.split('/');
  const key = ROUTE_KEYS.find((k) => SEGMENTS[from][k] === head);
  // An unknown path (the SPA's own 404) has no counterpart — send them home.
  if (key === undefined) return localePath(target, 'arena');
  return localePath(target, key, rest.join('/'));
}

/**
 * Language for a first-time visitor. The URL always wins (a shared `/en` link is
 * an explicit request for English); this only decides what an UNPREFIXED path
 * should show, and defaults everyone who is not a Polish speaker to English.
 */
export function detectLocale(languages: readonly string[]): Locale {
  const first = languages[0]?.toLowerCase() ?? '';
  return first.startsWith('pl') ? 'pl' : 'en';
}
