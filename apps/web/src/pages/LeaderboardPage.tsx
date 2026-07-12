import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { type GameId, BATTLESHIP_VARIANTS } from '@arena/game-core';

import { type EloHistoryPoint, type LeaderboardRow, apiGet } from '@/api/client';
import { ExplainNumbers } from '@/components/ExplainNumbers';
import { EloHistory } from '@/components/charts/EloHistory';
import { RadarCard } from '@/components/charts/RadarCard';
import { ScatterCostElo } from '@/components/charts/ScatterCostElo';
import { shortSubject } from '@/components/charts/theme';
import { Card, CardContent } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/hud';
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
import { pl } from '@/i18n/pl';
import { formatCost, formatMs } from '@/lib/format';
import { cn } from '@/lib/utils';

type Mode = 'model_vs_model' | 'human_vs_model';

function defaultVariant(game: GameId): string {
  return game === 'battleship' ? 'small' : 'standard';
}

type Subject = 'models' | 'humans';

export function LeaderboardPage() {
  const [game, setGame] = useState<GameId>('tictactoe');
  const [variant, setVariant] = useState('standard');
  const [mode, setMode] = useState<Mode>('model_vs_model');
  const [subject, setSubject] = useState<Subject>('models');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eloPoints, setEloPoints] = useState<EloHistoryPoint[]>([]);

  // The human board only exists in human_vs_model (SPEC §10).
  const humans = mode === 'human_vs_model' && subject === 'humans';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSelectedId(null);
    apiGet<LeaderboardRow[]>(
      `/api/leaderboard?mode=${mode}&game=${game}&variant=${variant}&subject=${humans ? 'humans' : 'models'}`,
    )
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) toast.error(pl.leaderboard.loadError);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mode, game, variant, humans]);

  // Elo history for the selected subject (§9.3.4).
  useEffect(() => {
    if (!selectedId) {
      setEloPoints([]);
      return;
    }
    let alive = true;
    apiGet<EloHistoryPoint[]>(
      `/api/elo-history?subjectId=${encodeURIComponent(selectedId)}&mode=${mode}&game=${game}&variant=${variant}`,
    )
      .then((p) => {
        if (alive) setEloPoints(p);
      })
      .catch(() => {
        if (alive) setEloPoints([]);
      });
    return () => {
      alive = false;
    };
  }, [selectedId, mode, game, variant]);

  const onGameChange = (g: GameId) => {
    setGame(g);
    setVariant(defaultVariant(g));
  };

  const selectedRow = rows.find((r) => r.subjectId === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <SectionLabel>{pl.leaderboard.title}</SectionLabel>
          <h1 className="font-sans text-4xl font-bold uppercase tracking-tight sm:text-5xl">
            {pl.games[game]}
          </h1>
        </div>
        <Link
          to="/porownaj"
          className="clip-tab border border-p1/40 bg-p1/10 px-3 py-1.5 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-p1 transition-colors hover:bg-p1/20"
        >
          {pl.nav.compare} →
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={game} onValueChange={(v) => onGameChange(v as GameId)}>
          <TabsList>
            <TabsTrigger value="tictactoe">{pl.games.tictactoe}</TabsTrigger>
            <TabsTrigger value="battleship">{pl.games.battleship}</TabsTrigger>
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
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            if (v !== 'human_vs_model') setSubject('models');
          }}
        >
          <TabsList>
            <TabsTrigger value="model_vs_model">{pl.mode.modelVsModel}</TabsTrigger>
            <TabsTrigger value="human_vs_model">{pl.mode.humanVsModel}</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === 'human_vs_model' && (
          <Tabs value={subject} onValueChange={(v) => setSubject(v as Subject)}>
            <TabsList>
              <TabsTrigger value="models">{pl.leaderboard.subjectModels}</TabsTrigger>
              <TabsTrigger value="humans">{pl.leaderboard.subjectHumans}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="w-full">
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {humans ? pl.leaderboard.humansEmpty : pl.leaderboard.empty}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">{pl.leaderboard.col.rank}</TableHead>
                      <TableHead>
                        {humans ? pl.leaderboard.col.player : pl.leaderboard.col.subject}
                      </TableHead>
                      <TableHead className="text-right">{pl.leaderboard.col.elo}</TableHead>
                      {game === 'tictactoe' && (
                        <TableHead className="text-right">
                          {pl.leaderboard.col.precision}
                        </TableHead>
                      )}
                      <TableHead className="text-right">{pl.leaderboard.col.wld}</TableHead>
                      <TableHead className="text-right">{pl.leaderboard.col.forfeit}</TableHead>
                      <TableHead className="text-right">{pl.leaderboard.col.latency}</TableHead>
                      {!humans && (
                        <TableHead className="text-right">{pl.leaderboard.col.cost}</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="font-mono text-xs">
                    {rows.map((r, i) => (
                      <TableRow
                        key={r.subjectId}
                        onClick={() => setSelectedId(r.subjectId)}
                        data-active={r.subjectId === selectedId}
                        className={cn(
                          'cursor-pointer transition-colors',
                          r.subjectId === selectedId
                            ? 'bg-p1/10'
                            : 'hover:bg-p1/5',
                        )}
                      >
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="max-w-52 truncate font-sans">
                          {humans ? (
                            // Humans are people, not models — no model card to link to.
                            // The nickname is a label; `subjectId` stays the real key,
                            // so the Elo chart below can still look this player up.
                            (r.label ?? r.subjectId)
                          ) : (
                            <Link
                              to={`/model/${r.subjectId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="underline-offset-2 hover:text-p1 hover:underline"
                            >
                              {shortSubject(r.subjectId)}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-p1">
                          {Math.round(r.elo)}
                        </TableCell>
                        {game === 'tictactoe' && (
                          <TableCell
                            className={cn(
                              'text-right',
                              r.optimalRate !== null && r.optimalRate >= 0.9 && 'text-edu',
                            )}
                          >
                            {r.optimalRate === null
                              ? '—'
                              : `${Math.round(r.optimalRate * 100)}%`}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          {r.wins}/{r.losses}/{r.draws}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            r.forfeitRate > 0.05 && 'text-warn',
                          )}
                        >
                          {Math.round(r.forfeitRate * 100)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {r.avgLatencyMs === null ? '—' : formatMs(r.avgLatencyMs)}
                        </TableCell>
                        {!humans && (
                          <TableCell className="text-right">
                            {r.avgCostPerGame === null ? '—' : formatCost(r.avgCostPerGame)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-dim">
                  {pl.leaderboard.rowHint}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost vs Elo is a model question — people do not pay per move. */}
        {humans ? (
          <Card className="w-full">
            <CardContent>
              <SectionLabel>{pl.leaderboard.subjectHumans}</SectionLabel>
              <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">
                {pl.leaderboard.humansNote}
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScatterCostElo rows={rows} />
        )}
      </div>

      {selectedRow && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RadarCard
            subjects={[selectedRow]}
            population={rows}
            title={`${pl.charts.radar.title} · ${selectedRow.label ?? shortSubject(selectedRow.subjectId)}`}
          />
          <EloHistory points={eloPoints} />
        </div>
      )}

      {/* §12.3 — the educational section is linked from the leaderboard. */}
      <ExplainNumbers />
    </div>
  );
}
