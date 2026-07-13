import { useEffect, useState } from 'react';

import { type LiveStats as LiveStatsData, fetchLiveStats } from '@/api/live';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { useT } from '@/i18n';
import { formatTokens } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Match the server-side heartbeat/TTL cadence — see server `lib/live`. */
const POLL_MS = 20_000;

/**
 * Home-page "arena pulse" (§ arena): matches in progress right now, split by
 * mode, plus the tokens models have burned across all ranked matches. Polls
 * `/api/live` on a timer; every call is best-effort, so a failure just leaves the
 * last value on screen and the panel hides itself when there is nothing to show.
 */
export function LiveStats() {
  const t = useT();
  const [stats, setStats] = useState<LiveStatsData | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const load = () =>
      fetchLiveStats({ signal: ctrl.signal })
        .then((s) => {
          if (alive) setStats(s);
        })
        .catch(() => {
          /* best-effort — keep whatever we last showed */
        });
    load();
    const interval = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(interval);
      ctrl.abort();
    };
  }, []);

  if (!stats) return null;
  const { live, totals } = stats;
  const hasTokens = totals !== null && totals.tokens > 0;
  // Fresh server, nobody playing and no history yet — nothing to say, so stay
  // out of the way rather than showing a row of zeros.
  if (live.total === 0 && !hasTokens) return null;

  const anyLive = live.total > 0;

  return (
    <HudPanel
      scanner={anyLive}
      accent="edu"
      className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-3"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-2.5" aria-hidden>
          {anyLive && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-edu/70" />
          )}
          <span
            className={cn(
              'relative inline-flex size-2.5 rounded-full',
              anyLive ? 'bg-edu' : 'bg-faint',
            )}
          />
        </span>
        <div className="flex flex-col gap-0.5">
          <SectionLabel className="text-edu">{t.live.kicker}</SectionLabel>
          {anyLive ? (
            <p className="font-sans text-sm font-bold uppercase tracking-wide">
              <span className="text-edu text-glow-edu">{live.total}</span> {t.live.heading}
            </p>
          ) : (
            <p className="max-w-prose font-mono text-xs text-muted-foreground">{t.live.none}</p>
          )}
        </div>
      </div>

      {anyLive && (
        <div className="flex items-center gap-5">
          <LiveCell value={live.human_vs_model} label={t.live.hvm} accent="p1" />
          <LiveCell value={live.model_vs_model} label={t.live.mvm} accent="p2" />
        </div>
      )}

      {hasTokens && (
        <div className="flex flex-col items-start sm:items-end">
          <span className="font-mono text-sm font-semibold text-p1">
            {formatTokens(totals!.tokens)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {t.live.tokensBurned}
          </span>
        </div>
      )}
    </HudPanel>
  );
}

function LiveCell({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: 'p1' | 'p2';
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn('font-mono text-lg font-bold', accent === 'p1' ? 'text-p1' : 'text-p2')}>
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
