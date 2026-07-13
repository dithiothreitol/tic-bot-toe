import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { type IntuitionRow, fetchIntuitionLeaderboard } from '@/api/community';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettings } from '@/store/settings';

/** „Ranking intuicji" (SPEC §12.5) — best predictors. Points only, zero stakes. */
export function IntuitionPage() {
  const t = useT();
  const [rows, setRows] = useState<IntuitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasNickname = useSettings((s) => s.nickname !== null);

  useEffect(() => {
    let alive = true;
    fetchIntuitionLeaderboard()
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) toast.error(t.intuition.loadError);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <SectionLabel>{t.intuition.title}</SectionLabel>
        <h1 className="font-sans text-4xl font-bold uppercase tracking-tight sm:text-5xl">
          {t.intuition.title}
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">{t.intuition.lead}</p>
      </header>

      {!hasNickname && (
        <p className="font-mono text-xs text-warn">{t.intuition.needNickname}</p>
      )}

      <HudPanel className="p-5">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t.intuition.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">{t.intuition.col.rank}</TableHead>
                  <TableHead>{t.intuition.col.player}</TableHead>
                  <TableHead className="text-right">{t.intuition.col.points}</TableHead>
                  <TableHead className="text-right">{t.intuition.col.total}</TableHead>
                  <TableHead className="text-right">{t.intuition.col.accuracy}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono text-xs">
                {rows.map((r, i) => (
                  <TableRow key={r.nickname}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-sans">{r.nickname}</TableCell>
                    <TableCell className="text-right font-bold text-edu">
                      {r.points}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.total}
                    </TableCell>
                    <TableCell
                      className={cn('text-right', r.accuracy >= 0.6 && 'text-edu')}
                    >
                      {Math.round(r.accuracy * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </HudPanel>
    </div>
  );
}
