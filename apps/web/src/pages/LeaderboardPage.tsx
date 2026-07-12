import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { type GameId, BATTLESHIP_VARIANTS } from '@arena/game-core';

import { type LeaderboardRow, apiGet } from '@/api/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

type Mode = 'model_vs_model' | 'human_vs_model';

function defaultVariant(game: GameId): string {
  return game === 'battleship' ? 'small' : 'standard';
}

function shortId(id: string): string {
  return id.replace(/^(openrouter|webllm):/, '');
}

export function LeaderboardPage() {
  const [game, setGame] = useState<GameId>('tictactoe');
  const [variant, setVariant] = useState('standard');
  const [mode, setMode] = useState<Mode>('model_vs_model');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet<LeaderboardRow[]>(
      `/api/leaderboard?mode=${mode}&game=${game}&variant=${variant}`,
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
  }, [mode, game, variant]);

  const onGameChange = (g: GameId) => {
    setGame(g);
    setVariant(defaultVariant(g));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{pl.leaderboard.title}</CardTitle>
        <CardDescription>{pl.games[game]}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="model_vs_model">{pl.mode.modelVsModel}</TabsTrigger>
              <TabsTrigger value="human_vs_model">{pl.mode.humanVsModel}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {pl.leaderboard.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">{pl.leaderboard.col.rank}</TableHead>
                  <TableHead>{pl.leaderboard.col.subject}</TableHead>
                  <TableHead className="text-right">{pl.leaderboard.col.elo}</TableHead>
                  <TableHead className="text-right">{pl.leaderboard.col.games}</TableHead>
                  <TableHead className="text-right">{pl.leaderboard.col.wld}</TableHead>
                  <TableHead className="text-right">{pl.leaderboard.col.forfeit}</TableHead>
                  <TableHead className="text-right">{pl.leaderboard.col.latency}</TableHead>
                  <TableHead className="text-right">{pl.leaderboard.col.cost}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono text-xs">
                {rows.map((r, i) => (
                  <TableRow key={r.subjectId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="max-w-52 truncate font-sans">
                      {shortId(r.subjectId)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-p1">
                      {Math.round(r.elo)}
                    </TableCell>
                    <TableCell className="text-right">{r.games}</TableCell>
                    <TableCell className="text-right">
                      {r.wins}/{r.losses}/{r.draws}
                    </TableCell>
                    <TableCell className="text-right">
                      {Math.round(r.forfeitRate * 100)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {r.avgLatencyMs === null ? '—' : formatMs(r.avgLatencyMs)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.avgCostPerGame === null ? '—' : formatCost(r.avgCostPerGame)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
