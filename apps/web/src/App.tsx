import { Settings } from 'lucide-react';
import { useState } from 'react';

import { type MatchConfig, GameRunner } from '@/components/GameRunner';
import { ModelLoadBar } from '@/components/ModelLoadBar';
import { SettingsDialog } from '@/components/SettingsDialog';
import { SetupScreen } from '@/components/SetupScreen';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { pl } from '@/i18n/pl';

export default function App() {
  const [screen, setScreen] = useState<'setup' | 'game'>('setup');
  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <button
            type="button"
            onClick={() => setScreen('setup')}
            className="text-left font-mono text-xl font-bold tracking-tight"
          >
            <span className="text-p1 text-glow-p1">tic</span>
            <span className="text-muted-foreground">-bot-</span>
            <span className="text-p2 text-glow-p2">toe</span>
          </button>
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
          <p className="text-center text-sm text-muted-foreground">{pl.appTagline}</p>

          <ModelLoadBar />

          {screen === 'setup' && (
            <SetupScreen
              onStart={(c) => {
                setConfig(c);
                setScreen('game');
              }}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}

          {screen === 'game' && config && (
            <GameRunner config={config} onExit={() => setScreen('setup')} />
          )}

          <p className="max-w-prose text-center text-xs text-muted-foreground">
            {pl.stage2Note}
          </p>
        </main>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <Toaster position="top-center" richColors />
      </div>
    </TooltipProvider>
  );
}
