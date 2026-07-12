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

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm transition-colors',
    isActive ? 'text-p1' : 'text-muted-foreground hover:text-foreground',
  );

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-mono text-xl font-bold tracking-tight">
              <span className="text-p1 text-glow-p1">tic</span>
              <span className="text-muted-foreground">-bot-</span>
              <span className="text-p2 text-glow-p2">toe</span>
            </Link>
            <nav className="flex items-center gap-4">
              <NavLink to="/" end className={navClass}>
                {pl.nav.arena}
              </NavLink>
              <NavLink to="/rankingi" className={navClass}>
                {pl.nav.rankings}
              </NavLink>
            </nav>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={pl.actions.settings}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-5" />
          </Button>
        </header>

        <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pb-16">
          <ModelLoadBar />
          <Routes>
            <Route
              path="/"
              element={<ArenaPage onOpenSettings={() => setSettingsOpen(true)} />}
            />
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
