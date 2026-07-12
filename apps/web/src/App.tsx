import { Settings } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router';

import { ModelLoadBar } from '@/components/ModelLoadBar';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TurnstileDialog } from '@/components/TurnstileDialog';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { pl } from '@/i18n/pl';
import { cn } from '@/lib/utils';
import { ArenaPage } from '@/pages/ArenaPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { useSettings } from '@/store/settings';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'clip-tab px-3 py-1.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
    isActive
      ? 'border border-p1/40 bg-p1/10 text-p1'
      : 'text-dim hover:text-foreground',
  );

/** Header status chip: reflects whether a local OpenRouter key is present. */
function KeyStatus({ onClick }: { onClick: () => void }) {
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
        <span className="text-muted-foreground">{pl.header.key}</span>
        <br />
        <span className={hasKey ? 'text-edu' : 'text-dim'}>
          {hasKey ? pl.header.keyLocal : pl.header.keyNone}
        </span>
      </span>
    </button>
  );
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-3">
                {/* Diamond HUD mark (DESIGN screens). */}
                <span
                  aria-hidden
                  className="glow-p1 size-6 rotate-45 bg-gradient-to-br from-p1 to-p2"
                />
                <span className="leading-none">
                  <span className="block font-mono text-base font-bold tracking-tight">
                    <span className="text-p1 text-glow-p1">tic</span>
                    <span className="text-dim">-bot-</span>
                    <span className="text-p2 text-glow-p2">toe</span>
                  </span>
                  <span className="mt-0.5 block font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
                    {pl.header.subtitle}
                  </span>
                </span>
              </Link>
              <nav className="flex items-center gap-2">
                <NavLink to="/" end className={navClass}>
                  {pl.nav.arena}
                </NavLink>
                <NavLink to="/rankingi" className={navClass}>
                  {pl.nav.rankings}
                </NavLink>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <KeyStatus onClick={openSettings} />
              <Button
                variant="ghost"
                size="icon"
                aria-label={pl.actions.settings}
                onClick={openSettings}
              >
                <Settings className="size-5" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex max-w-5xl flex-col items-stretch gap-6 px-4 py-8 pb-16">
          <ModelLoadBar />
          <Routes>
            <Route path="/" element={<ArenaPage onOpenSettings={openSettings} />} />
            <Route path="/rankingi" element={<LeaderboardPage />} />
          </Routes>
        </main>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <TurnstileDialog />
        <Toaster position="top-center" richColors />
      </div>
    </TooltipProvider>
  );
}
