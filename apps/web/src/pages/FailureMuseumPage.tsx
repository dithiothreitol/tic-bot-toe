import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import type { GameId } from '@arena/game-core';

import { type FailureRow, apiGet } from '@/api/client';
import { shortSubject } from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocalePath, useT } from '@/i18n';

const GAMES: GameId[] = ['tictactoe', 'battleship', 'sudoku', 'scrabble'];
type Filter = 'all' | GameId;

/**
 * „Muzeum wpadek" (Module B, plan §4.4). A feed of illegal / unparseable moves
 * models actually tried, from `/api/failures`. Every string was capped at capture
 * time and is rendered as plain text (React escapes; no markdown/linkify) — the
 * model's own words, quoted, nothing executed (plan risk #5).
 */
export function FailureMuseumPage() {
  const t = useT();
  const path = useLocalePath();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<FailureRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = filter === 'all' ? 'limit=100' : `game=${filter}&limit=100`;
    apiGet<FailureRow[]>(`/api/failures?${qs}`)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) toast.error(t.museum.loadError);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filter]);

  // Scrabble's illegal PLACEs carry the invented word in `attempted` — the
  // museum's signature exhibit. Deduped, newest kept.
  const inventedWords = useMemo(() => {
    const seen = new Set<string>();
    const words: string[] = [];
    for (const r of rows) {
      if (r.game === 'scrabble' && r.kind === 'illegal' && r.attempted) {
        const w = r.attempted.toUpperCase();
        if (!seen.has(w)) {
          seen.add(w);
          words.push(r.attempted);
        }
      }
    }
    return words.slice(0, 24);
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <SectionLabel>{t.museum.kicker}</SectionLabel>
        <h1 className="font-sans text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          {t.museum.title}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t.museum.lead}
        </p>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">{t.museum.filterAll}</TabsTrigger>
          {GAMES.map((g) => (
            <TabsTrigger key={g} value={g}>
              {t.games[g]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {inventedWords.length > 0 && (
        <HudPanel className="flex flex-col gap-3 p-5">
          <SectionLabel>{t.museum.inventedWords}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {inventedWords.map((w) => (
              <Badge key={w} variant="outline" className="font-mono text-sm">
                {w}
              </Badge>
            ))}
          </div>
        </HudPanel>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <HudPanel className="p-8">
          <p className="text-center text-sm text-muted-foreground">{t.museum.empty}</p>
        </HudPanel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r, i) => (
            <FailureCard key={`${r.matchId}-${i}`} row={r} replayHref={path('replay', r.matchId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FailureCard({ row, replayHref }: { row: FailureRow; replayHref: string }) {
  const t = useT();
  const path = useLocalePath();
  const gameLabel = t.games[row.game as GameId] ?? row.game;
  // The quote: the invented move (`attempted`) leads; otherwise the raw reply.
  const quote = row.attempted ?? row.excerpt;

  return (
    <HudPanel className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={path('model', row.subjectId)}
          className="max-w-[60%] truncate font-sans text-sm font-semibold hover:text-p1"
        >
          {shortSubject(row.subjectId)}
        </Link>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {gameLabel}
          </Badge>
          <Badge
            variant="outline"
            className={row.kind === 'illegal' ? 'text-warn text-[10px]' : 'text-dim text-[10px]'}
          >
            {row.kind === 'illegal' ? t.museum.kindIllegal : t.museum.kindUnparseable}
          </Badge>
        </div>
      </div>

      {quote && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {row.attempted ? t.museum.attempted : t.museum.said}
          </span>
          {/* Plain text only — the model's own output, quoted, never rendered as markup. */}
          <p className="break-words font-mono text-base text-foreground">“{quote}”</p>
        </div>
      )}

      {row.reason && (
        <p className="font-mono text-xs text-muted-foreground">
          {t.museum.reason}: {row.reason}
        </p>
      )}

      <Link
        to={replayHref}
        className="mt-auto font-mono text-[11px] uppercase tracking-wider text-p1 hover:underline"
      >
        {t.museum.replay} →
      </Link>
    </HudPanel>
  );
}
