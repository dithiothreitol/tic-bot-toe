import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MatchConfig } from '@/components/GameRunner';
import type { MatchMode } from '@/game/orchestrator';
import type { PlayerSpec } from '@/game/players';
import { pl } from '@/i18n/pl';
import { type CatalogModel, fetchCatalog } from '@/providers/openrouter-catalog';
import { useSettings } from '@/store/settings';

function specFor(model: CatalogModel, apiKey: string): PlayerSpec {
  return {
    kind: 'openrouter',
    model: model.id,
    displayName: model.name,
    apiKey,
    price: {
      prompt: model.pricePromptPerToken,
      completion: model.priceCompletionPerToken,
    },
  };
}

export function SetupScreen({
  onStart,
  onOpenSettings,
}: {
  onStart: (config: MatchConfig) => void;
  onOpenSettings: () => void;
}) {
  const [mode, setMode] = useState<MatchMode>('human_vs_model');
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [p1Model, setP1Model] = useState<CatalogModel | null>(null);
  const [p2Model, setP2Model] = useState<CatalogModel | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCatalog()
      .then((m) => {
        if (alive) setModels(m);
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

  const start = () => {
    const apiKey = useSettings.getState().openRouterKey;
    if (!apiKey) {
      toast.error(pl.setup.needKey);
      onOpenSettings();
      return;
    }
    const needP1 = mode === 'model_vs_model';
    if ((needP1 && !p1Model) || !p2Model) {
      toast.error(pl.setup.needModel);
      return;
    }

    const config: MatchConfig =
      mode === 'model_vs_model'
        ? {
            mode,
            p1: specFor(p1Model as CatalogModel, apiKey),
            p2: specFor(p2Model, apiKey),
            names: { p1: (p1Model as CatalogModel).name, p2: p2Model.name },
          }
        : {
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
        <CardDescription>{pl.games.tictactoe}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <Tabs value={mode} onValueChange={(v) => setMode(v as MatchMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="human_vs_model">{pl.mode.humanVsModel}</TabsTrigger>
            <TabsTrigger value="model_vs_model">{pl.mode.modelVsModel}</TabsTrigger>
          </TabsList>
        </Tabs>

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
            <span className="font-mono text-lg font-bold text-p1 text-glow-p1">X</span>
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
