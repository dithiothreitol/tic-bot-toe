import { useState } from 'react';

import { type MatchConfig, GameRunner } from '@/components/GameRunner';
import { SetupScreen } from '@/components/SetupScreen';
import { pl } from '@/i18n/pl';

export function ArenaPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [screen, setScreen] = useState<'setup' | 'game'>('setup');
  const [config, setConfig] = useState<MatchConfig | null>(null);

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-center text-sm text-muted-foreground">{pl.appTagline}</p>

      {screen === 'setup' && (
        <SetupScreen
          onStart={(c) => {
            setConfig(c);
            setScreen('game');
          }}
          onOpenSettings={onOpenSettings}
        />
      )}

      {screen === 'game' && config && (
        <GameRunner config={config} onExit={() => setScreen('setup')} />
      )}

      <p className="max-w-prose text-center text-xs text-muted-foreground">
        {pl.stage2Note}
      </p>
    </div>
  );
}
