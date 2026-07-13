import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  type GameId,
  type Variant,
  BATTLESHIP_VARIANTS,
  TICTACTOE_VARIANTS,
} from '@arena/game-core';

import { BattleshipGlyph, TicTacToeGlyph } from '@/components/GameGlyph';
import { ModelPicker } from '@/components/ModelPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/hud';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { MatchConfig } from '@/components/GameRunner';
import type { MatchMode } from '@/game/orchestrator';
import type { PlayerSpec } from '@/game/players';
import { useT, variantLabel } from '@/i18n';
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

/**
 * Game-select tile: glyph over title + meta, stacked and left-aligned
 * (screen 01). Overrides the Tabs trigger's default centered single-line row.
 */
const gameTileClass =
  'h-auto flex-col items-start justify-start gap-2.5 whitespace-normal px-3 py-3';

/** Prompt-lab overrides applied to every LLM in the match (§12.4). */
interface LabTuning {
  temperature: number;
  systemAppendix: string;
}

function specFor(
  model: SelectableModel,
  apiKey: string | null,
  lab?: LabTuning,
): PlayerSpec {
  const tuning = lab
    ? { temperature: lab.temperature, systemAppendix: lab.systemAppendix }
    : {};
  if (model.provider === 'webllm') {
    return { kind: 'webllm', model: model.id, displayName: model.name, ...tuning };
  }
  if (model.provider === 'ollama') {
    return { kind: 'ollama', model: model.id, displayName: model.name, ...tuning };
  }
  return {
    kind: 'openrouter',
    model: model.id,
    displayName: model.name,
    apiKey: apiKey ?? '',
    price: model.price,
    ...tuning,
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
  const t = useT();
  const [game, setGame] = useState<GameId>('tictactoe');
  const [variantId, setVariantId] = useState('small');
  const [mode, setMode] = useState<MatchMode>('human_vs_model');
  const [catalog, setCatalog] = useState<SelectableModel[]>([]);
  const [ollama, setOllama] = useState<SelectableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [p1Model, setP1Model] = useState<SelectableModel | null>(null);
  const [p2Model, setP2Model] = useState<SelectableModel | null>(null);
  const [webGpu] = useState(() => isWebGpuAvailable());
  const [labOpen, setLabOpen] = useState(false);
  const [appendix, setAppendix] = useState('');
  const [temperature, setTemperature] = useState(0.2);
  // §12.1 — commentator is OFF by default; turning it on means picking a model.
  const [commentatorOn, setCommentatorOn] = useState(false);
  const [commentatorModel, setCommentatorModel] = useState<SelectableModel | null>(null);
  // The funded server coach (Gemini) is offered only when the server has a key.
  const [coachAvailable, setCoachAvailable] = useState(false);
  const [commentatorSource, setCommentatorSource] = useState<'byok' | 'server'>('byok');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCatalog()
      .then((m) => {
        if (alive) setCatalog(catalogToSelectable(m));
      })
      .catch(() => {
        if (alive) toast.error(t.setup.catalogError);
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
    apiGet<{ ollama?: boolean; coach?: boolean }>('/api/health')
      .then((h) => {
        if (alive && h.coach) {
          setCoachAvailable(true);
          setCommentatorSource('server'); // funded coach is the friendlier default
        }
        return h.ollama ? fetchOllamaModels() : [];
      })
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
      toast.error(t.setup.needModel);
      return;
    }
    const chosen = [needP1 ? p1Model : null, p2Model].filter(
      (m): m is SelectableModel => m !== null,
    );
    const apiKey = useSettings.getState().openRouterKey;
    if (chosen.some((m) => m.provider === 'openrouter') && !apiKey) {
      toast.error(t.setup.needKey);
      onOpenSettings();
      return;
    }

    // A BYOK commentator on OpenRouter runs on the user's key — refuse without one.
    // The funded server coach needs no key, so it is exempt.
    const byokCommentator = commentatorOn && commentatorSource === 'byok';
    if (byokCommentator && commentatorModel?.provider === 'openrouter' && !apiKey) {
      toast.error(t.setup.needKey);
      onOpenSettings();
      return;
    }
    if (byokCommentator && !commentatorModel) {
      toast.error(t.setup.needModel);
      return;
    }

    const lab: LabTuning | undefined = labOpen
      ? { temperature, systemAppendix: appendix }
      : undefined;
    const commentator: MatchConfig['commentator'] = !commentatorOn
      ? undefined
      : commentatorSource === 'server'
        ? { source: 'server' }
        : commentatorModel
          ? {
              source: 'byok',
              provider: commentatorModel.provider,
              id: commentatorModel.id,
              name: commentatorModel.name,
            }
          : undefined;
    const base = { game, variant, seed: randomSeed(), lab: labOpen, commentator };
    const config: MatchConfig =
      mode === 'model_vs_model'
        ? {
            ...base,
            mode,
            p1: specFor(p1Model as SelectableModel, apiKey, lab),
            p2: specFor(p2Model, apiKey, lab),
            names: { p1: (p1Model as SelectableModel).name, p2: p2Model.name },
          }
        : {
            ...base,
            mode: 'human_vs_model',
            p1: { kind: 'human', displayName: t.player.human },
            p2: specFor(p2Model, apiKey, lab),
            names: { p1: t.player.human, p2: p2Model.name },
          };
    onStart(config);
  };

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <SectionLabel tag="01">{t.setup.game}</SectionLabel>
          <Tabs value={game} onValueChange={(v) => setGame(v as GameId)}>
            {/* h-9 comes from the Tabs cva variant — override it with the same
                selector, otherwise the taller tiles overflow the list. */}
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 group-data-[orientation=horizontal]/tabs:h-auto">
              <TabsTrigger
                value="tictactoe"
                aria-label={t.games.tictactoe}
                className={gameTileClass}
              >
                <TicTacToeGlyph />
                <span className="flex flex-col items-start gap-0.5 text-left">
                  <span className="text-sm font-semibold text-foreground">
                    {t.games.tictactoe}
                  </span>
                  <span className="font-mono text-[10px] normal-case tracking-normal text-faint">
                    {t.gameMeta.tictactoe}
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="battleship"
                aria-label={t.games.battleship}
                className={gameTileClass}
              >
                <BattleshipGlyph />
                <span className="flex flex-col items-start gap-0.5 text-left">
                  <span className="text-sm font-semibold text-foreground">
                    {t.games.battleship}
                  </span>
                  <span className="font-mono text-[10px] normal-case tracking-normal text-faint">
                    {t.gameMeta.battleship}
                  </span>
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        {game === 'battleship' && (
          <section className="flex flex-col gap-2">
            <SectionLabel tag="02">{t.setup.variant}</SectionLabel>
            <Select value={variantId} onValueChange={setVariantId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BATTLESHIP_VARIANTS.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {variantLabel(t, v.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <SectionLabel tag={game === 'battleship' ? '03' : '02'}>
            {t.mode.label}
          </SectionLabel>
          <Tabs value={mode} onValueChange={(v) => setMode(v as MatchMode)}>
            <TabsList className="grid h-auto w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-auto">
              <TabsTrigger value="human_vs_model" className="py-2.5">
                {t.mode.humanVsModel}
              </TabsTrigger>
              <TabsTrigger value="model_vs_model" className="py-2.5">
                {t.mode.modelVsModel}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {mode === 'model_vs_model' ? (
            <div className="flex flex-col gap-2">
              <Label className="text-p1">{t.setup.modelP1}</Label>
              <ModelPicker
                models={models}
                loading={loading}
                value={p1Model?.id ?? null}
                onSelect={setP1Model}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label className="text-p1">{t.player.p1}</Label>
              <div className="clip-cut flex items-center gap-2 border border-p1/30 bg-card-inset px-3 py-2 text-sm">
                <span className="font-mono text-lg font-bold text-p1 text-glow-p1">
                  {game === 'tictactoe' ? 'X' : '⚓'}
                </span>
                <span>{t.player.human}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label className="text-p2">
              {mode === 'model_vs_model' ? t.setup.modelP2 : t.setup.chooseModel}
            </Label>
            <ModelPicker
              models={models}
              loading={loading}
              value={p2Model?.id ?? null}
              onSelect={setP2Model}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <SectionLabel>{t.commentator.section}</SectionLabel>
              <p className="max-w-prose text-xs text-muted-foreground">
                {t.commentator.lead}
              </p>
            </div>
            <Switch
              checked={commentatorOn}
              onCheckedChange={setCommentatorOn}
              aria-label={t.commentator.toggle}
            />
          </div>

          {commentatorOn && (
            <div className="flex flex-col gap-2.5">
              {coachAvailable && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-edu">{t.commentator.sourceLabel}</Label>
                  <Tabs
                    value={commentatorSource}
                    onValueChange={(v) => setCommentatorSource(v as 'byok' | 'server')}
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="server">{t.commentator.sourceServer}</TabsTrigger>
                      <TabsTrigger value="byok">{t.commentator.sourceOwn}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}

              {coachAvailable && commentatorSource === 'server' ? (
                <p className="font-mono text-[10px] text-dim">{t.commentator.serverHint}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-edu">{t.commentator.model}</Label>
                  <ModelPicker
                    models={models}
                    loading={loading}
                    value={commentatorModel?.id ?? null}
                    onSelect={setCommentatorModel}
                  />
                  <p className="font-mono text-[10px] text-dim">{t.commentator.costHint}</p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <SectionLabel>{t.lab.section}</SectionLabel>
              <p className="max-w-prose text-xs text-muted-foreground">{t.lab.lead}</p>
            </div>
            <Switch
              checked={labOpen}
              onCheckedChange={setLabOpen}
              aria-label={t.lab.toggle}
            />
          </div>

          {labOpen && (
            <div className="flex flex-col gap-4 clip-cut border border-edu/30 bg-edu/5 p-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lab-appendix" className="text-edu">
                  {t.lab.appendix}
                </Label>
                <Textarea
                  id="lab-appendix"
                  value={appendix}
                  onChange={(e) => setAppendix(e.target.value)}
                  placeholder={t.lab.appendixPlaceholder}
                  rows={3}
                />
                <p className="font-mono text-[10px] text-dim">{t.lab.appendixHint}</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-edu">{t.lab.temperature}</Label>
                  <span className="font-mono text-sm font-bold text-edu">
                    {temperature.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[temperature]}
                  onValueChange={([t]) => setTemperature(t ?? 0.2)}
                  min={0}
                  max={1.5}
                  step={0.05}
                  aria-label={t.lab.temperature}
                />
                <p className="font-mono text-[10px] text-dim">{t.lab.temperatureHint}</p>
              </div>

              <p className="font-mono text-[10px] uppercase tracking-wider text-edu/80">
                {t.lab.excludedNote}
              </p>
            </div>
          )}
        </section>
      </CardContent>

      <CardFooter>
        <Button size="lg" className="w-full" onClick={start}>
          {t.setup.start}
        </Button>
      </CardFooter>
    </Card>
  );
}
