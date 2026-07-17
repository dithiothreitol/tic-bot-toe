import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { type GameId, BATTLESHIP_VARIANTS } from '@arena/game-core';

import {
  type EloHistoryPoint,
  type HallucinationRow,
  type LeaderboardRow,
  apiGet,
} from '@/api/client';
import { ExplainNumbers } from '@/components/ExplainNumbers';
import { EloHistory } from '@/components/charts/EloHistory';
import { RadarCard } from '@/components/charts/RadarCard';
import { shortSubject } from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale, useLocalePath, useT, variantLabel } from '@/i18n';
import { formatCost, formatMs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type ModelMeta, describeModel } from '@/lib/model-copy';
import { type CatalogModel, fetchCatalog } from '@/providers/openrouter-catalog';
import { WEBLLM_MODELS } from '@/providers/webllm';

type Mode = 'model_vs_model' | 'human_vs_model';

interface OpponentRow {
  id: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}
interface ModelCardResponse {
  subjectId: string;
  card: LeaderboardRow | null;
  opponents: OpponentRow[];
}

/** Map a ranking subject id back onto catalog metadata for the copy template. */
function metaForSubject(subjectId: string, catalog: CatalogModel[]): ModelMeta | null {
  if (subjectId.startsWith('openrouter:')) {
    const id = subjectId.slice('openrouter:'.length);
    const m = catalog.find((c) => c.id === id);
    if (!m) return null;
    return {
      provider: 'openrouter',
      id: m.id,
      name: m.name,
      isFree: m.isFree,
      contextLength: m.contextLength,
      price: { prompt: m.pricePromptPerToken, completion: m.priceCompletionPerToken },
    };
  }
  if (subjectId.startsWith('webllm:')) {
    const id = subjectId.slice('webllm:'.length);
    const m = WEBLLM_MODELS.find((w) => w.mlcId === id);
    return { provider: 'webllm', id, name: m?.name ?? id, isFree: true, contextLength: null };
  }
  if (subjectId.startsWith('ollama:')) {
    const id = subjectId.slice('ollama:'.length);
    return { provider: 'ollama', id, name: id, isFree: true, contextLength: null };
  }
  return null; // human:<uuid> — a person, not a catalog model
}

function defaultVariant(game: GameId): string {
  return game === 'battleship' ? 'small' : 'standard';
}

export function ModelCardPage() {
  const t = useT();
  const path = useLocalePath();
  const locale = useLocale();
  // Splat route: subject ids carry slashes (openrouter:meta-llama/llama-3).
  const params = useParams();
  const subjectId = params['*'] ?? '';

  const [game, setGame] = useState<GameId>('tictactoe');
  const [variant, setVariant] = useState('standard');
  const [mode, setMode] = useState<Mode>('model_vs_model');
  const [population, setPopulation] = useState<LeaderboardRow[]>([]);
  const [data, setData] = useState<ModelCardResponse | null>(null);
  const [halluc, setHalluc] = useState<HallucinationRow[]>([]);
  const [eloPoints, setEloPoints] = useState<EloHistoryPoint[]>([]);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!subjectId) return;
    let alive = true;
    setLoading(true);
    const qs = `mode=${mode}&game=${game}&variant=${variant}`;
    Promise.all([
      apiGet<LeaderboardRow[]>(`/api/leaderboard?${qs}`),
      apiGet<ModelCardResponse>(`/api/model/${subjectId}?${qs}`),
      apiGet<EloHistoryPoint[]>(
        `/api/elo-history?subjectId=${encodeURIComponent(subjectId)}&${qs}`,
      ),
      apiGet<HallucinationRow[]>(`/api/hallucinations?${qs}`),
    ])
      .then(([rows, card, elo, hall]) => {
        if (!alive) return;
        setPopulation(rows);
        setData(card);
        setEloPoints(elo);
        setHalluc(hall);
      })
      .catch(() => {
        if (alive) toast.error(t.modelCard.loadError);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [subjectId, mode, game, variant]);

  const meta = useMemo(() => metaForSubject(subjectId, catalog), [subjectId, catalog]);
  const copy = useMemo(() => (meta ? describeModel(meta, locale) : null), [meta, locale]);

  const card = data?.card ?? null;
  // Position in the discipline ranking (most disciplined = 1). The endpoint
  // returns rows ordered best-first, so the index is the rank. Absent when this
  // subject is not in the pool (no ranked moves) — the section then says so.
  const disciplineRank = useMemo(() => {
    if (halluc.length === 0) return null;
    const idx = halluc.findIndex((h) => h.subjectId === subjectId);
    return idx >= 0 ? t.modelCard.disciplineRank(idx + 1, halluc.length) : null;
  }, [halluc, subjectId, t]);

  const onGameChange = (g: GameId) => {
    setGame(g);
    setVariant(defaultVariant(g));
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to={path('rankings')} className="font-mono text-xs text-dim hover:text-p1">
          {t.modelCard.back}
        </Link>
        <SectionLabel>{t.modelCard.kicker}</SectionLabel>
        <h1 className="font-sans text-3xl font-bold uppercase tracking-tight break-all sm:text-4xl">
          {shortSubject(subjectId)}
        </h1>
        {copy && (
          <div className="flex flex-wrap gap-2">
            {copy.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </header>

      {/* Layman description — rule template, deterministic, not an LLM (§12.3). */}
      <HudPanel brackets accent="edu" className="flex flex-col gap-3 p-5">
        <SectionLabel className="text-edu">{t.modelCard.whoIsIt}</SectionLabel>
        {copy ? (
          <>
            <p className="font-sans text-lg font-bold text-edu text-glow-edu">
              {copy.headline}
            </p>
            <div className="flex max-w-prose flex-col gap-2">
              {copy.sentences.map((s) => (
                <p key={s} className="text-sm leading-relaxed text-muted-foreground">
                  {s}
                </p>
              ))}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-dim">
              {t.modelCard.generatedNote}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t.modelCard.noMeta}</p>
        )}
      </HudPanel>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={game} onValueChange={(v) => onGameChange(v as GameId)}>
          <TabsList>
            <TabsTrigger value="tictactoe">{t.games.tictactoe}</TabsTrigger>
            <TabsTrigger value="battleship">{t.games.battleship}</TabsTrigger>
          </TabsList>
        </Tabs>
        {game === 'battleship' && (
          <Select value={variant} onValueChange={setVariant}>
            <SelectTrigger className="w-40">
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
        )}
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="model_vs_model">{t.mode.modelVsModel}</TabsTrigger>
            <TabsTrigger value="human_vs_model">{t.mode.humanVsModel}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : card === null ? (
        <HudPanel className="p-6">
          <p className="text-center text-sm text-muted-foreground">
            {t.modelCard.notRanked}
          </p>
        </HudPanel>
      ) : (
        <>
          <HudPanel className="flex flex-col gap-3 p-5">
            <SectionLabel>{t.modelCard.stats}</SectionLabel>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t.leaderboard.col.elo} value={String(Math.round(card.elo))} accent />
              <Stat label={t.leaderboard.col.games} value={String(card.games)} />
              <Stat
                label={t.leaderboard.col.wld}
                value={`${card.wins}/${card.losses}/${card.draws}`}
              />
              <Stat
                label={t.leaderboard.col.precision}
                value={
                  card.optimalRate === null ? '—' : `${Math.round(card.optimalRate * 100)}%`
                }
              />
              <Stat
                label={t.leaderboard.col.forfeit}
                value={`${Math.round(card.forfeitRate * 100)}%`}
              />
              <Stat
                label={t.leaderboard.col.cost}
                value={card.avgCostPerGame === null ? '—' : formatCost(card.avgCostPerGame)}
              />
            </dl>
            <p className="font-mono text-[10px] text-dim">
              {t.leaderboard.col.latency}:{' '}
              {card.avgLatencyMs === null ? '—' : formatMs(card.avgLatencyMs)}
            </p>
          </HudPanel>

          <HudPanel className="flex flex-col gap-3 p-5">
            <SectionLabel>{t.modelCard.hallucinations}</SectionLabel>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {t.modelCard.hallucinationsLead}
            </p>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
                  {t.leaderboard.col.forfeit}
                </span>
                <span
                  className={cn(
                    'font-mono text-3xl font-bold',
                    card.forfeitRate > 0.05 ? 'text-warn' : 'text-edu',
                  )}
                >
                  {Math.round(card.forfeitRate * 100)}%
                </span>
              </div>
              <p className="font-mono text-xs text-dim">
                {disciplineRank ?? t.modelCard.noDisciplineRank}
              </p>
            </div>
          </HudPanel>

          <div className="grid gap-4 lg:grid-cols-2">
            <RadarCard
              subjects={[card]}
              population={population}
              title={`${t.charts.radar.title} · ${shortSubject(subjectId)}`}
            />
            <EloHistory points={eloPoints} />
          </div>

          <HudPanel className="flex flex-col gap-3 p-5">
            <SectionLabel>{t.modelCard.opponents}</SectionLabel>
            {data && data.opponents.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.modelCard.col.opponent}</TableHead>
                      <TableHead className="text-right">{t.modelCard.col.games}</TableHead>
                      <TableHead className="text-right">{t.modelCard.col.wld}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="font-mono text-xs">
                    {data.opponents.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="max-w-52 truncate font-sans">
                          <Link to={path('model', o.id)} className="hover:text-p1">
                            {shortSubject(o.id)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">{o.games}</TableCell>
                        <TableCell className="text-right">
                          <span className="text-edu">{o.wins}</span>/
                          <span className="text-danger">{o.losses}</span>/{o.draws}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.modelCard.opponentsEmpty}</p>
            )}
          </HudPanel>
        </>
      )}

      <ExplainNumbers />
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</dt>
      <dd
        className={
          accent
            ? 'font-mono text-xl font-bold text-p1 text-glow-p1'
            : 'font-mono text-xl font-bold'
        }
      >
        {value}
      </dd>
    </div>
  );
}
