import { useEffect, useState } from 'react';

import {
  type DailyOpponent,
  type Variant,
  BATTLESHIP_VARIANTS,
  SUDOKU_VARIANTS,
  TICTACTOE_VARIANTS,
} from '@arena/game-core';

import { type DailyState, fetchDaily } from '@/api/community';
import type { MatchConfig } from '@/components/GameRunner';
import { Button } from '@/components/ui/button';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlayerSpec } from '@/game/players';
import { useT, variantLabel } from '@/i18n';
import { type CatalogModel, fetchCatalog } from '@/providers/openrouter-catalog';
import { isWebGpuAvailable } from '@/providers/webllm';
import { useSettings } from '@/store/settings';

function variantFor(game: string, variantId: string): Variant {
  if (game === 'battleship') {
    return BATTLESHIP_VARIANTS.find((v) => v.id === variantId) ?? BATTLESHIP_VARIANTS[0];
  }
  if (game === 'sudoku') {
    return SUDOKU_VARIANTS.find((v) => v.id === variantId) ?? SUDOKU_VARIANTS[0];
  }
  return TICTACTOE_VARIANTS[0];
}

function specFor(
  opponent: DailyOpponent,
  apiKey: string | null,
  catalog: CatalogModel[] | null,
): PlayerSpec {
  if (opponent.provider === 'webllm') {
    return { kind: 'webllm', model: opponent.id, displayName: opponent.name };
  }
  return {
    kind: 'openrouter',
    model: opponent.id,
    displayName: opponent.name,
    apiKey: apiKey ?? '',
    // The pool is free-only (§12.6), so the snapshot is an honest zero.
    price: { prompt: 0, completion: 0 },
    // Free pools include reasoning models (e.g. deepseek-r1:free) that forfeit
    // every move under the terse token cap — give them room from the catalog flag.
    reasoningModel: catalog?.find((m) => m.id === opponent.id)?.isReasoning,
  };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Daily challenge tile (SPEC §12.6). The challenge itself comes from the server,
 * which derives it from the date — there is no schedule to drift out of sync.
 */
export function DailyChallengeCard({
  onStart,
  onOpenSettings,
}: {
  onStart: (config: MatchConfig) => void;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<DailyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [webGpu] = useState(() => isWebGpuAvailable());
  const [catalog, setCatalog] = useState<CatalogModel[] | null>(null);
  const hasKey = useSettings((s) => s.openRouterKey !== null);

  useEffect(() => {
    let alive = true;
    fetchDaily()
      .then((s) => {
        if (alive) setState(s);
      })
      .catch(() => {
        // Ranking endpoints are optional (no DB → no challenge). Stay quiet.
        if (alive) setState(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Needed to tell "today's opponent was retired" from "it's just offline".
  useEffect(() => {
    let alive = true;
    fetchCatalog()
      .then((c) => {
        if (alive) setCatalog(c);
      })
      .catch(() => {
        if (alive) setCatalog(null); // catalog unreachable — don't accuse the pool
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <Skeleton className="h-28 w-full" />;
  if (!state) return null;

  const { challenge, streak, todayCompleted } = state;
  const opp = challenge.opponent;
  const gameLabel = t.games[challenge.game];
  const variant = variantFor(challenge.game, challenge.variant);
  const label =
    challenge.game === 'battleship' || challenge.game === 'sudoku'
      ? `${gameLabel} · ${variantLabel(t, variant.id)}`
      : gameLabel;

  // A retired `:free` id would otherwise let the player "win" against a model
  // that only ever forfeits random moves. Refuse the challenge instead of
  // serving a phantom — the server would reject the claim anyway.
  const retired =
    opp.provider === 'openrouter' &&
    catalog !== null &&
    !catalog.some((m) => m.id === opp.id);

  const blocked = retired
    ? t.daily.opponentRetired
    : opp.provider === 'webllm' && !webGpu
      ? t.daily.needWebGpu
      : opp.provider === 'openrouter' && !hasKey
        ? t.daily.needKey
        : null;

  const start = () => {
    if (blocked) {
      if (opp.provider === 'openrouter') onOpenSettings();
      return;
    }
    onStart({
      game: challenge.game,
      variant,
      mode: 'human_vs_model',
      p1: { kind: 'human', displayName: t.player.human },
      p2: specFor(opp, useSettings.getState().openRouterKey, catalog),
      names: { p1: t.player.human, p2: opp.name },
      seed: randomSeed(),
      daily: true,
    });
  };

  return (
    <HudPanel
      brackets
      accent="edu"
      scanner={!todayCompleted}
      className="flex flex-wrap items-center justify-between gap-4 p-5"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel className="text-edu">{t.daily.kicker}</SectionLabel>
        <p className="font-sans text-lg font-bold uppercase tracking-tight sm:text-xl">
          {t.daily.headline(opp.name, label)}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-dim">
          {t.daily.free} · {challenge.day}
        </p>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex flex-col items-center">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {t.daily.streak}
          </span>
          <span className="font-mono text-2xl font-bold text-edu text-glow-edu">
            {streak}
          </span>
        </div>

        {todayCompleted ? (
          <div className="flex flex-col gap-1">
            <span className="font-sans text-sm font-bold uppercase text-edu">
              ✓ {t.daily.done}
            </span>
            <span className="max-w-48 text-xs text-muted-foreground">
              {t.daily.doneToday}
            </span>
          </div>
        ) : blocked ? (
          <div className="flex max-w-64 flex-col gap-2">
            <p className="text-xs text-warn">{blocked}</p>
            {opp.provider === 'openrouter' && !retired && (
              <Button variant="outline" size="sm" onClick={onOpenSettings}>
                {t.actions.settings}
              </Button>
            )}
          </div>
        ) : (
          <Button variant="edu" onClick={start}>
            {t.daily.play}
          </Button>
        )}
      </div>
    </HudPanel>
  );
}
