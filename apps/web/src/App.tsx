import { Settings } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
} from 'react-router';

import { ModelLoadBar } from '@/components/ModelLoadBar';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TurnstileDialog } from '@/components/TurnstileDialog';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  type Locale,
  LOCALES,
  LOCALE_PREFIX,
  LocaleProvider,
  browserLanguages,
  detectLocale,
  routeSegment,
  translatePath,
  useI18n,
  useLocalePath,
  useT,
} from '@/i18n';
import { cn } from '@/lib/utils';
import { ArenaPage } from '@/pages/ArenaPage';
import { ComparePage } from '@/pages/ComparePage';
import { FailureMuseumPage } from '@/pages/FailureMuseumPage';
import { IntuitionPage } from '@/pages/IntuitionPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { ModelCardPage } from '@/pages/ModelCardPage';
import { ReplayPage } from '@/pages/ReplayPage';
import { useSettings } from '@/store/settings';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'clip-tab shrink-0 whitespace-nowrap px-3 py-1.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
    isActive
      ? 'border border-p1/40 bg-p1/10 text-p1'
      : 'text-dim hover:text-foreground',
  );

/** Header status chip: reflects whether a local OpenRouter key is present. */
function KeyStatus({ onClick }: { onClick: () => void }) {
  const t = useT();
  const hasKey = useSettings((s) => s.openRouterKey !== null);
  return (
    <button
      type="button"
      onClick={onClick}
      className="clip-cut hidden items-center gap-2 border border-border bg-card/60 px-3 py-2 text-left transition-colors hover:bg-accent sm:flex"
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          hasKey ? 'bg-edu shadow-[0_0_8px_var(--accent-edu)]' : 'bg-faint',
        )}
      />
      <span className="font-mono text-[11px] leading-tight">
        <span className="text-muted-foreground">{t.header.key}</span>
        <br />
        <span className={hasKey ? 'text-edu' : 'text-dim'}>
          {hasKey ? t.header.keyLocal : t.header.keyNone}
        </span>
      </span>
    </button>
  );
}

/**
 * Language switcher. Real `<Link>`s, not buttons: the other language IS another
 * URL (`/rankingi` ⇄ `/en/rankings`), so it has to be middle-clickable, copyable
 * and crawlable. Clicking one also records the choice — from then on it beats the
 * browser's own language (see `LocaleGate`).
 */
function LanguageSwitcher() {
  const { locale } = useI18n();
  const t = useT();
  const { pathname } = useLocation();
  const setLocalePref = useSettings((s) => s.setLocalePref);

  return (
    <div className="flex items-center" role="group" aria-label={t.lang.switchTo}>
      {LOCALES.map((l) => (
        <Link
          key={l}
          to={translatePath(pathname, l)}
          hrefLang={l}
          lang={l}
          onClick={() => setLocalePref(l)}
          aria-current={l === locale ? 'true' : undefined}
          className={cn(
            'px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
            l === locale ? 'text-p1' : 'text-faint hover:text-foreground',
          )}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}

/**
 * First-visit language routing. Polish paths are unprefixed — they are the
 * canonical URLs and predate the second locale — so a visitor whose browser is
 * not Polish would otherwise land on Polish copy. Rendered only inside the Polish
 * shell: an `/en` link is already an explicit choice and must never bounce.
 *
 * A stored preference always beats the browser; that is what makes the switcher
 * stick. Deliberately client-side: crawlers keep indexing the Polish URLs, and
 * both languages are declared to them via hreflang + sitemap (server `og/seo.ts`).
 */
function LocaleGate() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const localePref = useSettings((s) => s.localePref);

  useEffect(() => {
    const wanted: Locale = localePref ?? detectLocale(browserLanguages());
    if (wanted === 'en') navigate(translatePath(pathname, 'en'), { replace: true });
  }, [pathname, localePref, navigate]);

  return null;
}

function Nav({ className }: { className?: string }) {
  const t = useT();
  const path = useLocalePath();
  return (
    <nav className={cn('no-scrollbar flex items-center gap-2 overflow-x-auto', className)}>
      <NavLink to={path('arena')} end className={navClass}>
        {t.nav.arena}
      </NavLink>
      <NavLink to={path('rankings')} className={navClass}>
        {t.nav.rankings}
      </NavLink>
      <NavLink to={path('compare')} className={navClass}>
        {t.nav.compare}
      </NavLink>
      <NavLink to={path('intuition')} className={navClass}>
        {t.nav.intuition}
      </NavLink>
      <NavLink to={path('failures')} className={navClass}>
        {t.nav.failures}
      </NavLink>
    </nav>
  );
}

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useT();
  const path = useLocalePath();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      {/* Wrapping row: brand + controls stay on the top line; the nav rides
          alongside on wide screens and drops to its own scrollable row below
          `lg`, so nothing gets squeezed off-screen on mobile. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to={path('arena')} className="order-1 flex shrink-0 items-center gap-3">
          {/* Diamond HUD mark — generated brand asset (scripts/gen). */}
          <img
            src="/logo.png"
            alt=""
            aria-hidden
            width={28}
            height={28}
            className="size-7 shrink-0"
          />
          <span className="leading-none">
            <span className="block whitespace-nowrap font-mono text-base font-bold tracking-tight">
              <span className="text-p1 text-glow-p1">tic</span>
              <span className="text-dim">-bot-</span>
              <span className="text-p2 text-glow-p2">toe</span>
            </span>
            {/* The tagline is the widest bit of the brand; hide it on the
                narrowest screens so the wordmark keeps to one line. */}
            <span className="mt-0.5 hidden whitespace-nowrap font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-faint sm:block">
              {t.header.subtitle}
            </span>
          </span>
        </Link>
        <div className="order-2 ml-auto flex items-center gap-2 lg:order-3">
          <LanguageSwitcher />
          <KeyStatus onClick={onOpenSettings} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.actions.settings}
            onClick={onOpenSettings}
          >
            <Settings className="size-5" />
          </Button>
        </div>
        <Nav className="order-3 w-full lg:order-2 lg:w-auto" />
      </div>
    </header>
  );
}

/** What the shell hands down to its pages (the settings dialog lives up here). */
export interface ShellContext {
  openSettings: () => void;
}

export const useShell = (): ShellContext => useOutletContext<ShellContext>();

/**
 * One shell per locale. The locale comes from the ROUTE, so the URL and the
 * rendered language cannot drift apart — no store lookup, no effect, no flash of
 * the wrong language on load.
 */
function Shell({ locale }: { locale: Locale }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);

  return (
    <LocaleProvider locale={locale}>
      <TooltipProvider delayDuration={200}>
        {locale === 'pl' && <LocaleGate />}
        <div className="min-h-dvh">
          <Header onOpenSettings={openSettings} />

          <main className="mx-auto flex max-w-5xl flex-col items-stretch gap-6 px-4 py-8 pb-16">
            <ModelLoadBar />
            <Outlet context={{ openSettings } satisfies ShellContext} />
          </main>

          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
          <TurnstileDialog />
          <Toaster position="top-center" richColors />
        </div>
      </TooltipProvider>
    </LocaleProvider>
  );
}

/** The same pages in every locale — only the path segments differ. */
function localeRoutes(locale: Locale): ReactNode {
  return (
    <>
      <Route index element={<ArenaPage />} />
      <Route path={routeSegment(locale, 'rankings')} element={<LeaderboardPage />} />
      <Route path={routeSegment(locale, 'compare')} element={<ComparePage />} />
      <Route path={routeSegment(locale, 'intuition')} element={<IntuitionPage />} />
      <Route path={routeSegment(locale, 'failures')} element={<FailureMuseumPage />} />
      {/* Splat: subject ids carry slashes (openrouter:meta-llama/llama-3). */}
      <Route path={`${routeSegment(locale, 'model')}/*`} element={<ModelCardPage />} />
      <Route path={`${routeSegment(locale, 'replay')}/:id`} element={<ReplayPage />} />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path={LOCALE_PREFIX.en} element={<Shell locale="en" />}>
        {localeRoutes('en')}
      </Route>
      <Route path="/" element={<Shell locale="pl" />}>
        {localeRoutes('pl')}
      </Route>
    </Routes>
  );
}
