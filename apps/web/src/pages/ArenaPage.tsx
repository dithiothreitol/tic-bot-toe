import { useState } from 'react';

import { useShell } from '@/App';
import { DailyChallengeCard } from '@/components/DailyChallengeCard';
import { type MatchConfig, GameRunner } from '@/components/GameRunner';
import { QuickStartSection } from '@/components/QuickStartSection';
import { SetupScreen } from '@/components/SetupScreen';
import { SectionLabel } from '@/components/ui/hud';
import { useT } from '@/i18n';

export function ArenaPage() {
  const t = useT();
  // The settings dialog lives in the shell (one per locale), so the page reaches
  // it through the layout route's context rather than a prop drilled from App.
  const { openSettings } = useShell();
  const [screen, setScreen] = useState<'setup' | 'game'>('setup');
  const [config, setConfig] = useState<MatchConfig | null>(null);

  const start = (c: MatchConfig) => {
    setConfig(c);
    setScreen('game');
  };

  return (
    <div className="flex flex-col gap-6">
      {screen === 'setup' && (
        <>
          <header className="relative isolate flex min-h-[220px] flex-col justify-center gap-2 overflow-hidden">
            {/* Decorative backdrop. The mask keeps the left side clean so the
                headline never fights the art (the render is briefed with that
                dark safe zone on the left). */}
            <img
              src="/hero.webp"
              alt=""
              aria-hidden
              width={1600}
              height={900}
              className="pointer-events-none absolute inset-0 -z-10 size-full object-cover opacity-75 [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent_5%,black_55%),linear-gradient(to_bottom,transparent,black_22%,black_72%,transparent)]"
            />
            <SectionLabel>{t.arena.kicker}</SectionLabel>
            <h1 className="font-sans text-4xl font-bold uppercase tracking-tight sm:text-5xl">
              {t.arena.heading}
            </h1>
            <p className="max-w-prose text-sm text-muted-foreground">{t.arena.lead}</p>
          </header>

          {/* §12.6 — remounts on return to setup, so the streak refreshes itself. */}
          <DailyChallengeCard onStart={start} onOpenSettings={openSettings} />

          <SetupScreen onStart={start} onOpenSettings={openSettings} />

          <QuickStartSection />

          <p className="max-w-prose text-xs text-dim">{t.footerNote}</p>
        </>
      )}

      {screen === 'game' && config && (
        <GameRunner config={config} onExit={() => setScreen('setup')} />
      )}
    </div>
  );
}
