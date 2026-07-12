import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  type GameId,
  type Variant,
  BATTLESHIP_VARIANTS,
  TICTACTOE_VARIANTS,
} from '@arena/game-core';

import { ModelPicker } from '@/components/ModelPicker';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MatchConfig } from '@/components/GameRunner';
import type { MatchMode } from '@/game/orchestrator';
import type { PlayerSpec } from '@/game/players';
import { pl } from '@/i18n/pl';
import { apiGet } from '@/api/client';
import {
  type SelectableModel,
  catalogToSelectable,
  ollamaSelectable,
  webLlmSelectable,
} from '@/providers/models';
import { fetchOllamaModels } from '@/providers/ollama';
import { fetchCatalog } from '@/providers/openrouter-catalog';
import { isWebGpuAvailable } from '@/providers/webllm';
import { useSettings } from '@/store/settings';

function specFor(model: SelectableModel, apiKey: string | null): PlayerSpec {
  if (model.provider === 'webllm') {
    return { kind: 'webllm', model: model.id, displayName: model.name };
  }
  if (model.provider === 'ollama') {
    return { kind: 'ollama', model: model.id, displayName: model.name };
  }
  return {
    kind: 'openrouter',
    model: model.id,
    displayName: model.name,
    apiKey: apiKey ?? '',
    price: model.price,
  };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function SetupScreen({
  onStart,
  onOpenSettings,
}: {
  onStart: (config: MatchConfig) => void;
  onOpenSettings: () => void;
}) {
  const [game, setGame] = useState<GameId>('tictactoe');
  const [variantId, setVariantId] = useState('small');
  const [mode, setMode] = useState<MatchMode>('human_vs_model');
  const [catalog, setCatalog] = useState<SelectableModel[]>([]);
  const [ollama, setOllama] = useState<SelectableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [p1Model, setP1Model] = useState<SelectableModel | null>(null);
  const [p2Model, setP2Model] = useState<SelectableModel | null>(null);
  const [webGpu] = useState(() => isWebGpuAvailable());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCatalog()
      .then((m) => {
        if (alive) setCatalog(catalogToSelectable(m));
      })
      .catch(() => {
        if (alive) toast.error(pl.setup.catalogError);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Ollama models — only when the server has ENABLE_OLLAMA (from /api/health).
  useEffect(() => {
    let alive = true;
    apiGet<{ ollama?: boolean }>('/api/health')
      .then((h) => (h.ollama ? fetchOllamaModels() : []))
      .then((m) => {
        if (alive) setOllama(ollamaSelectable(m));
      })
      .catch(() => {
        /* server not reachable / no ollama — silently skip */
      });
    return () => {
      alive = false;
    };
  }, []);

  const models = useMemo(
    () => [...(webGpu ? webLlmSelectable() : []), ...ollama, ...catalog],
    [catalog, ollama, webGpu],
  );

  const variant: Variant = useMemo(
    () =>
      game === 'battleship'
        ? (BATTLESHIP_VARIANTS.find((v) => v.id === variantId) ?? BATTLESHIP_VARIANTS[0])
        : TICTACTOE_VARIANTS[0],
    [game, variantId],
  );

  const start = () => {
    const needP1 = mode === 'model_vs_model';
    if ((needP1 && !p1Model) || !p2Model) {
      toast.error(pl.setup.needModel);
      return;
    }
    const chosen = [needP1 ? p1Model : null, p2Model].filter(
      (m): m is SelectableModel => m !== null,
    );
    const apiKey = useSettings.getState().openRouterKey;
    if (chosen.some((m) => m.provider === 'openrouter') && !apiKey) {
      toast.error(pl.setup.needKey);
      onOpenSettings();
      return;
    }

    const base = { game, variant, seed: randomSeed() };
    const config: MatchConfig =
      mode === 'model_vs_model'
        ? {
            ...base,
            mode,
            p1: specFor(p1Model as SelectableModel, apiKey),
            p2: specFor(p2Model, apiKey),
            names: { p1: (p1Model as SelectableModel).name, p2: p2Model.name },
          }
        : {
            ...base,
            mode: 'human_vs_model',
            p1: { kind: 'human' },
            p2: specFor(p2Model, apiKey),
            names: { p1: pl.player.human, p2: p2Model.name },
          };
    onStart(config);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{pl.setup.title}</CardTitle>
        <CardDescription>{pl.games[game]}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{pl.setup.game}</Label>
          <Tabs value={game} onValueChange={(v) => setGame(v as GameId)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="tictactoe">{pl.games.tictactoe}</TabsTrigger>
              <TabsTrigger value="battleship">{pl.games.battleship}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {game === 'battleship' && (
          <div className="flex flex-col gap-2">
            <Label>{pl.setup.variant}</Label>
            <Select value={variantId} onValueChange={setVariantId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BATTLESHIP_VARIANTS.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>{pl.mode.label}</Label>
          <Tabs value={mode} onValueChange={(v) => setMode(v as MatchMode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="human_vs_model">{pl.mode.humanVsModel}</TabsTrigger>
              <TabsTrigger value="model_vs_model">{pl.mode.modelVsModel}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {mode === 'model_vs_model' ? (
          <div className="flex flex-col gap-2">
            <Label>{pl.setup.modelP1}</Label>
            <ModelPicker
              models={models}
              loading={loading}
              value={p1Model?.id ?? null}
              onSelect={setP1Model}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-p1/30 px-3 py-2 text-sm">
            <span className="font-mono text-lg font-bold text-p1 text-glow-p1">
              {game === 'tictactoe' ? 'X' : '⚓'}
            </span>
            <span>{pl.player.human}</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>{mode === 'model_vs_model' ? pl.setup.modelP2 : pl.setup.chooseModel}</Label>
          <ModelPicker
            models={models}
            loading={loading}
            value={p2Model?.id ?? null}
            onSelect={setP2Model}
          />
        </div>
      </CardContent>

      <CardFooter>
        <Button className="w-full" onClick={start}>
          {pl.setup.start}
        </Button>
      </CardFooter>
    </Card>
  );
}
