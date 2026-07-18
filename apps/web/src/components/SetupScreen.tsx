import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  type GameId,
  type Variant,
  BATTLESHIP_VARIANTS,
  SCRABBLE_VARIANTS,
  SUDOKU_VARIANTS,
  TICTACTOE_VARIANTS,
} from '@arena/game-core';

import { BattleshipGlyph, ScrabbleGlyph, SudokuGlyph, TicTacToeGlyph } from '@/components/GameGlyph';
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
import { useSetupPrefs } from '@/store/setup';

/**
 * Game-select tile: glyph over title + meta, stacked and left-aligned
 * (screen 01). Overrides the Tabs trigger's default centered single-line row.
 */
const gameTileClass =
  'h-auto flex-col items-start justify-start gap-2.5 whitespace-normal px-3 py-3';

/** The selectable variants for a game (tic-tac-toe has a single one). */
function variantsForGame(game: GameId): Variant[] {
  if (game === 'battleship') return BATTLESHIP_VARIANTS;
  if (game === 'sudoku') return SUDOKU_VARIANTS;
  if (game === 'scrabble') return SCRABBLE_VARIANTS;
  return TICTACTOE_VARIANTS;
}

/** The human's board glyph per game, shown in the P1 slot. */
function humanSymbol(game: GameId): string {
  if (game === 'tictactoe') return 'X';
  if (game === 'sudoku') return '#';
  if (game === 'scrabble') return '✎';
  return '⚓';
}

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
    // Reasoning models forfeit every move under the terse token cap; give them
    // room to emit content after their hidden chain-of-thought.
    reasoningModel: model.isReasoning,
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
  // Everything the user picks here is persisted (§16): the arena unmounts this
  // screen while a match runs, and "back to setup" must return to the same
  // configuration — changing one model should not mean re-picking all of them.
  //
  // Defaults worth knowing: reasoning OFF (§8 — the ranking is no-reasoning, so
  // a reasoning match is saved as a lab match and skips Elo), safety ON (auto-stop
  // for forfeit loops / token blowouts, 0 disables a rule), commentator OFF (§12.1).
  const {
    game,
    variantId,
    mode,
    p1ModelId,
    p2ModelId,
    labOpen,
    appendix,
    temperature,
    promptDuelOn,
    appendixA,
    appendixB,
    seriesLength,
    reasoning,
    safetyOn,
    maxForfeits,
    maxTokens,
    commentatorOn,
    commentatorModelId,
    patch,
  } = useSetupPrefs();
  const [catalog, setCatalog] = useState<SelectableModel[]>([]);
  const [ollama, setOllama] = useState<SelectableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [webGpu] = useState(() => isWebGpuAvailable());
  // The funded server coach (Gemini) is offered only when the server has a key.
  const [coachAvailable, setCoachAvailable] = useState(false);
  const commentatorSource = useSetupPrefs((s) => s.commentatorSource) ?? 'byok';

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
          // Funded coach is the friendlier default — but only for a user who has
          // not picked a source yet; an explicit BYOK choice must survive.
          if (useSetupPrefs.getState().commentatorSource === null) {
            patch({ commentatorSource: 'server' });
          }
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

  // Persisted picks are ids; the model objects come from the freshly loaded
  // catalog, so an id that vanished from it reads as "nothing selected".
  const byId = (id: string | null) => models.find((m) => m.id === id) ?? null;
  const p1Model = byId(p1ModelId);
  const p2Model = byId(p2ModelId);
  const commentatorModel = byId(commentatorModelId);

  // Variants per game (tic-tac-toe has a single one → no selector). `variantId`
  // is a shared pref, so a stale cross-game id (e.g. 'small' while on sudoku)
  // falls back to the game's first variant.
  const variantList = variantsForGame(game);
  const variant: Variant = useMemo(
    () => variantList.find((v) => v.id === variantId) ?? variantList[0],
    [variantList, variantId],
  );
  const hasVariant = variantList.length > 1;

  // Prompt duel (Module F): one model plays ITSELF over a series, so only the
  // p1 slot (the duel model) is used — the p2 picker is irrelevant here. The duel
  // is inherently model-vs-model, so it does NOT depend on the mode selector
  // (enabling the toggle also switches the mode); otherwise it would silently
  // no-op in the default human-vs-model mode.
  const duelActive = labOpen && promptDuelOn;

  const start = () => {
    const needP1 = mode === 'model_vs_model';
    if (duelActive ? !p1Model : (needP1 && !p1Model) || !p2Model) {
      toast.error(t.setup.needModel);
      return;
    }
    const chosen = (duelActive ? [p1Model] : [needP1 ? p1Model : null, p2Model]).filter(
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
    const safety: MatchConfig['safety'] = safetyOn
      ? { maxConsecutiveForfeits: maxForfeits, maxTokens }
      : { maxConsecutiveForfeits: 0, maxTokens: 0 };
    const base = { game, variant, seed: randomSeed(), lab: labOpen, reasoning, commentator, safety };

    // Prompt duel: both sides are the SAME model; the per-game appendix (A/B) is
    // injected by the SeriesRunner, so the base specs carry no appendix. The
    // series is always a lab match (excluded from Elo). Seed is fresh per run.
    if (duelActive && p1Model) {
      const spec = specFor(p1Model, apiKey, { temperature, systemAppendix: '' });
      onStart({
        ...base,
        lab: true,
        // A duel is always model-vs-model regardless of the mode selector.
        mode: 'model_vs_model',
        // The lightweight SeriesRunner has no commentator — drop it rather than
        // carry one it would silently ignore.
        commentator: undefined,
        p1: spec,
        p2: spec,
        names: { p1: p1Model.name, p2: p1Model.name },
        series: { appendixA, appendixB, seriesLength, seriesSeed: randomSeed() },
      });
      return;
    }

    // Past the duel early-return this is a normal match; the guard at the top
    // already ensured p2 (and p1 when needed), so narrow for the build below.
    if (!p2Model) return;
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
          <Tabs value={game} onValueChange={(v) => patch({ game: v as GameId })}>
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
              <TabsTrigger value="sudoku" aria-label={t.games.sudoku} className={gameTileClass}>
                <SudokuGlyph />
                <span className="flex flex-col items-start gap-0.5 text-left">
                  <span className="text-sm font-semibold text-foreground">{t.games.sudoku}</span>
                  <span className="font-mono text-[10px] normal-case tracking-normal text-faint">
                    {t.gameMeta.sudoku}
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger value="scrabble" aria-label={t.games.scrabble} className={gameTileClass}>
                <ScrabbleGlyph />
                <span className="flex flex-col items-start gap-0.5 text-left">
                  <span className="text-sm font-semibold text-foreground">{t.games.scrabble}</span>
                  <span className="font-mono text-[10px] normal-case tracking-normal text-faint">
                    {t.gameMeta.scrabble}
                  </span>
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </section>

        {hasVariant && (
          <section className="flex flex-col gap-2">
            <SectionLabel tag="02">{t.setup.variant}</SectionLabel>
            <Select value={variant.id} onValueChange={(v) => patch({ variantId: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variantList.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {variantLabel(t, v.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <SectionLabel tag={hasVariant ? '03' : '02'}>
            {t.mode.label}
          </SectionLabel>
          <Tabs value={mode} onValueChange={(v) => patch({ mode: v as MatchMode })}>
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
                onSelect={(m) => patch({ p1ModelId: m.id })}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label className="text-p1">{t.player.p1}</Label>
              <div className="clip-cut flex items-center gap-2 border border-p1/30 bg-card-inset px-3 py-2 text-sm">
                <span className="font-mono text-lg font-bold text-p1 text-glow-p1">
                  {humanSymbol(game)}
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
              onSelect={(m) => patch({ p2ModelId: m.id })}
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
              onCheckedChange={(v) => patch({ commentatorOn: v })}
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
                    onValueChange={(v) =>
                      patch({ commentatorSource: v as 'byok' | 'server' })
                    }
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
                    onSelect={(m) => patch({ commentatorModelId: m.id })}
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
              <SectionLabel>{t.reasoning.section}</SectionLabel>
              <p className="max-w-prose text-xs text-muted-foreground">{t.reasoning.lead}</p>
            </div>
            <Switch
              checked={reasoning}
              onCheckedChange={(v) => patch({ reasoning: v })}
              aria-label={t.reasoning.toggle}
            />
          </div>
          {reasoning && (
            <p className="clip-cut border border-p2/30 bg-p2/5 p-3 font-mono text-[10px] uppercase tracking-wider text-p2/80">
              {t.reasoning.excludedNote}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-border/60 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <SectionLabel>{t.safety.section}</SectionLabel>
              <p className="max-w-prose text-xs text-muted-foreground">{t.safety.lead}</p>
            </div>
            <Switch
              checked={safetyOn}
              onCheckedChange={(v) => patch({ safetyOn: v })}
              aria-label={t.safety.toggle}
            />
          </div>

          {safetyOn && (
            <div className="flex flex-col gap-4 clip-cut border border-border bg-card-inset p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t.safety.forfeits}</Label>
                  <span className="font-mono text-sm font-bold">
                    {maxForfeits === 0 ? t.safety.off : maxForfeits}
                  </span>
                </div>
                <Slider
                  value={[maxForfeits]}
                  onValueChange={([v]) => patch({ maxForfeits: v ?? 0 })}
                  min={0}
                  max={9}
                  step={1}
                  aria-label={t.safety.forfeits}
                />
                <p className="font-mono text-[10px] text-dim">{t.safety.forfeitsHint}</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t.safety.tokens}</Label>
                  <span className="font-mono text-sm font-bold">
                    {maxTokens === 0 ? t.safety.off : `${(maxTokens / 1000).toFixed(0)}k`}
                  </span>
                </div>
                <Slider
                  value={[maxTokens]}
                  onValueChange={([v]) => patch({ maxTokens: v ?? 0 })}
                  min={0}
                  max={200_000}
                  step={10_000}
                  aria-label={t.safety.tokens}
                />
                <p className="font-mono text-[10px] text-dim">{t.safety.tokensHint}</p>
              </div>
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
              onCheckedChange={(v) => patch({ labOpen: v })}
              aria-label={t.lab.toggle}
            />
          </div>

          {labOpen && (
            <div className="flex flex-col gap-4 clip-cut border border-edu/30 bg-edu/5 p-4">
              {!promptDuelOn && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lab-appendix" className="text-edu">
                    {t.lab.appendix}
                  </Label>
                  <Textarea
                    id="lab-appendix"
                    value={appendix}
                    onChange={(e) => patch({ appendix: e.target.value })}
                    placeholder={t.lab.appendixPlaceholder}
                    rows={3}
                  />
                  <p className="font-mono text-[10px] text-dim">{t.lab.appendixHint}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-edu">{t.lab.temperature}</Label>
                  <span className="font-mono text-sm font-bold text-edu">
                    {temperature.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[temperature]}
                  onValueChange={([v]) => patch({ temperature: v ?? 0.2 })}
                  min={0}
                  max={1.5}
                  step={0.05}
                  aria-label={t.lab.temperature}
                />
                <p className="font-mono text-[10px] text-dim">{t.lab.temperatureHint}</p>
              </div>

              {/* Prompt duel (Module F): one model, two appendices, N-game series. */}
              <div className="flex flex-col gap-3 border-t border-edu/20 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-edu">{t.lab.duel.toggle}</Label>
                    <p className="max-w-prose font-mono text-[10px] text-dim">{t.lab.duel.lead}</p>
                  </div>
                  <Switch
                    checked={promptDuelOn}
                    // Turning the duel on switches to model-vs-model — a duel is
                    // one model against itself, so human mode makes no sense.
                    onCheckedChange={(v) =>
                      patch(v ? { promptDuelOn: true, mode: 'model_vs_model' } : { promptDuelOn: false })
                    }
                    aria-label={t.lab.duel.toggle}
                  />
                </div>

                {promptDuelOn && (
                  <div className="flex flex-col gap-4">
                    <p className="max-w-prose font-mono text-[10px] text-dim">
                      {t.lab.duel.modelNote}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="lab-appendix-a" className="text-p1">
                        {t.lab.duel.promptA}
                      </Label>
                      <Textarea
                        id="lab-appendix-a"
                        value={appendixA}
                        onChange={(e) => patch({ appendixA: e.target.value })}
                        placeholder={t.lab.duel.placeholderA}
                        rows={3}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="lab-appendix-b" className="text-p2">
                        {t.lab.duel.promptB}
                      </Label>
                      <Textarea
                        id="lab-appendix-b"
                        value={appendixB}
                        onChange={(e) => patch({ appendixB: e.target.value })}
                        placeholder={t.lab.duel.placeholderB}
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-edu">{t.lab.duel.length}</Label>
                      {[3, 5, 7].map((n) => (
                        <Button
                          key={n}
                          type="button"
                          size="sm"
                          variant={seriesLength === n ? 'default' : 'outline'}
                          onClick={() => patch({ seriesLength: n })}
                          aria-pressed={seriesLength === n}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
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
