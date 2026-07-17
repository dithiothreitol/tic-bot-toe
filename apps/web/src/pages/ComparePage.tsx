import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { type GameId, BATTLESHIP_VARIANTS } from '@arena/game-core';

import {
  type HeadToHead,
  type LeaderboardRow,
  type PsychologyPayload,
  type PsychologyResponse,
  apiGet,
} from '@/api/client';
import { BehaviorHeatmap, MIN_PSYCH_SAMPLE } from '@/components/charts/BehaviorHeatmap';
import { RadarCard } from '@/components/charts/RadarCard';
import { shortSubject } from '@/components/charts/theme';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT, variantLabel } from '@/i18n';
import { cn } from '@/lib/utils';

type Mode = 'model_vs_model' | 'human_vs_model';

function defaultVariant(game: GameId): string {
  return game === 'battleship' ? 'small' : 'standard';
}

/** §9.3.5 — overlaid radar of two subjects + head-to-head tally. */
export function ComparePage() {
  const t = useT();
  const [game, setGame] = useState<GameId>('tictactoe');
  const [variant, setVariant] = useState('standard');
  const [mode, setMode] = useState<Mode>('model_vs_model');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [h2h, setH2h] = useState<HeadToHead | null>(null);
  const [psychA, setPsychA] = useState<PsychologyResponse | null>(null);
  const [psychB, setPsychB] = useState<PsychologyResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setAId(null);
    setBId(null);
    apiGet<LeaderboardRow[]>(`/api/leaderboard?mode=${mode}&game=${game}&variant=${variant}`)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) toast.error(t.leaderboard.loadError);
      });
    return () => {
      alive = false;
    };
  }, [mode, game, variant]);

  const sameModel = aId !== null && aId === bId;

  useEffect(() => {
    if (!aId || !bId || sameModel) {
      setH2h(null);
      return;
    }
    let alive = true;
    apiGet<HeadToHead>(
      `/api/head-to-head?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}&mode=${mode}&game=${game}&variant=${variant}`,
    )
      .then((r) => {
        if (alive) setH2h(r);
      })
      .catch(() => {
        if (alive) setH2h(null);
      });
    return () => {
      alive = false;
    };
  }, [aId, bId, sameModel, mode, game, variant]);

  // Behavioural heatmaps for each pick (Module C), mode/game/variant-scoped like
  // everything else on the page. Fetched independently — one model may have a
  // sample while the other doesn't. Cleared when a slot is empty or A===B.
  useEffect(() => {
    let alive = true;
    const load = (id: string | null, set: (r: PsychologyResponse | null) => void) => {
      if (!id || sameModel) {
        set(null);
        return;
      }
      apiGet<PsychologyResponse>(
        `/api/psychology?subjectId=${encodeURIComponent(id)}&mode=${mode}&game=${game}&variant=${variant}`,
      )
        .then((r) => {
          if (alive) set(r);
        })
        .catch(() => {
          if (alive) set(null);
        });
    };
    load(aId, setPsychA);
    load(bId, setPsychB);
    return () => {
      alive = false;
    };
  }, [aId, bId, sameModel, mode, game, variant]);

  const rowA = rows.find((r) => r.subjectId === aId) ?? null;
  const rowB = rows.find((r) => r.subjectId === bId) ?? null;
  const subjects = useMemo(
    () => [rowA, rowB].filter((r): r is LeaderboardRow => r !== null && !sameModel),
    [rowA, rowB, sameModel],
  );

  const onGameChange = (g: GameId) => {
    setGame(g);
    setVariant(defaultVariant(g));
  };

  const picker = (value: string | null, onChange: (id: string) => void, label: string) => (
    <div className="flex flex-1 flex-col gap-2">
      <label className="section-label">{label}</label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={t.charts.compare.pickPrompt} />
        </SelectTrigger>
        <SelectContent>
          {rows.map((r) => (
            <SelectItem key={r.subjectId} value={r.subjectId}>
              {shortSubject(r.subjectId)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <SectionLabel>{t.nav.compare}</SectionLabel>
        <h1 className="font-sans text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          {t.charts.compare.title}
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">{t.charts.compare.lead}</p>
      </header>

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

      <div className="flex flex-wrap gap-4">
        {picker(aId, setAId, t.charts.compare.pickA)}
        {picker(bId, setBId, t.charts.compare.pickB)}
      </div>

      {sameModel && (
        <p className="font-mono text-xs text-warn">{t.charts.compare.sameModel}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RadarCard subjects={subjects} population={rows} title={t.charts.compare.title} />

        <HudPanel className="flex flex-col gap-3 p-4">
          <SectionLabel>{t.charts.compare.h2h}</SectionLabel>
          {h2h && h2h.games > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <HeadToHeadCell value={h2h.aWins} label={shortSubject(h2h.a)} color="text-p1" />
                <HeadToHeadCell value={h2h.draws} label={t.charts.compare.draws} color="text-dim" />
                <HeadToHeadCell value={h2h.bWins} label={shortSubject(h2h.b)} color="text-p2" />
              </div>
              <p className="text-center font-mono text-[11px] uppercase tracking-wider text-dim">
                {t.charts.compare.games}: {h2h.games}
              </p>
            </div>
          ) : (
            <p
              className="flex items-center justify-center text-center font-mono text-xs text-dim"
              style={{ minHeight: 120 }}
            >
              {sameModel || !aId || !bId ? t.charts.compare.lead : t.charts.compare.noShared}
            </p>
          )}
        </HudPanel>
      </div>

      {!sameModel &&
        ((psychA?.payload != null && psychA.n >= MIN_PSYCH_SAMPLE) ||
          (psychB?.payload != null && psychB.n >= MIN_PSYCH_SAMPLE)) && (
        <HudPanel className="flex flex-col gap-3 p-5">
          <SectionLabel>{t.modelCard.psychology}</SectionLabel>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t.modelCard.psychologyLead}
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <CompareHeatmap
              t={t}
              label={rowA ? shortSubject(rowA.subjectId) : t.charts.compare.pickA}
              payload={psychA?.payload ?? null}
              n={psychA?.n ?? 0}
              accent="p1"
            />
            <CompareHeatmap
              t={t}
              label={rowB ? shortSubject(rowB.subjectId) : t.charts.compare.pickB}
              payload={psychB?.payload ?? null}
              n={psychB?.n ?? 0}
              accent="p2"
            />
          </div>
        </HudPanel>
      )}
    </div>
  );
}

/**
 * One subject's "signature" heatmap for the compare view: the opening spread —
 * first move (tic-tac-toe) or all shots (battleship). Empty state below the
 * sample floor so a thin history isn't read as a real pattern.
 */
function CompareHeatmap({
  t,
  label,
  payload,
  n,
  accent,
}: {
  t: ReturnType<typeof useT>;
  label: string;
  payload: PsychologyPayload | null;
  n: number;
  accent: 'p1' | 'p2';
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="truncate font-mono text-xs uppercase tracking-wider text-dim">{label}</span>
      {payload === null || n < MIN_PSYCH_SAMPLE ? (
        <p className="font-mono text-[11px] text-dim">{t.modelCard.psychologyEmpty}</p>
      ) : (
        <>
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {payload.game === 'tictactoe' ? t.modelCard.psychFirstMove : t.modelCard.psychAllShots}
          </span>
          <div style={{ width: payload.game === 'tictactoe' ? 120 : 200 }}>
            {payload.game === 'tictactoe' ? (
              <BehaviorHeatmap
                values={payload.firstMoveCounts}
                cols={3}
                showValues
                accent={accent}
                ariaLabel={`${label} — ${t.modelCard.psychFirstMove}`}
              />
            ) : (
              <BehaviorHeatmap
                values={payload.shotCounts}
                cols={payload.size}
                accent={accent}
                ariaLabel={`${label} — ${t.modelCard.psychAllShots}`}
              />
            )}
          </div>
          <span className="font-mono text-[10px] text-dim">{t.modelCard.psychologySample(n)}</span>
        </>
      )}
    </div>
  );
}

function HeadToHeadCell({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="clip-cut border border-border bg-card-inset px-2 py-3">
      <div className={cn('text-3xl font-bold', color)}>{value}</div>
      <div className="mt-1 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
