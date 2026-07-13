import { type ReactNode, createContext, useContext, useEffect, useMemo } from 'react';

import { en } from './en';
import { pl } from './pl';
import { type Locale, type RouteKey, localePath } from './routes';
import type { Dict } from './types';

const DICTS: Record<Locale, Dict> = { pl, en };

export interface I18n {
  locale: Locale;
  /** The active dictionary. Read it in components as `const t = useT()`. */
  t: Dict;
  /** Path builder bound to the active locale: `path('rankings')`. */
  path: (key: RouteKey, rest?: string) => string;
}

/**
 * The locale comes from the ROUTE (see `App.tsx`), never from a store, so the
 * URL and the rendered language can never disagree. The default below only ever
 * applies to components rendered outside the shell (tests, storybook-style use).
 */
const I18nContext = createContext<I18n>({
  locale: 'pl',
  t: pl,
  path: (key, rest) => localePath('pl', key, rest),
});

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<I18n>(
    () => ({
      locale,
      t: DICTS[locale],
      path: (key, rest) => localePath(locale, key, rest),
    }),
    [locale],
  );

  // The server ships the right `lang` in the shell; this keeps it honest during
  // client-side navigation (and in `vite dev`, which serves the static shell).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = (): I18n => useContext(I18nContext);
export const useT = (): Dict => useContext(I18nContext).t;
export const useLocale = (): Locale => useContext(I18nContext).locale;
export const useLocalePath = (): I18n['path'] => useContext(I18nContext).path;
