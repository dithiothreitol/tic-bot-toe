/**
 * The localized URL shape lives in `@arena/i18n` because the SERVER needs the very
 * same table (sitemap, hreflang alternates, per-locale OG tags). Re-exported here
 * so components keep importing everything i18n from one place.
 */
export {
  type Locale,
  type RouteKey,
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_PREFIX,
  ROUTE_KEYS,
  detectLocale,
  isLocale,
  localeFromPath,
  localePath,
  routeSegment,
  translatePath,
} from '@arena/i18n';

/** `navigator.languages`, with the single-value and non-browser fallbacks. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
}
