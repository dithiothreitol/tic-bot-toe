import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import {
  type AnalyzedMove,
  type BattleshipState,
  type MoveQuality,
  type PlayerSide,
  type TicTacToeState,
  analyzeMatch,
  battleship,
} from '@arena/game-core';

import { type ReplayMatch, apiGet } from '@/api/client';
import { BattleshipBoard } from '@/components/BattleshipBoard';
import { Board3x3 } from '@/components/Board3x3';
import { TimelineChart } from '@/components/charts/TimelineChart';
import { shortSubject } from '@/components/charts/theme';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import type { MoveLogEntry } from '@/game/orchestrator';
import { useLocalePath, useT } from '@/i18n';
import { formatMove } from '@/lib/format';
import type { Commentary } from '@/providers/commentator';
import { reconstructStates } from '@/lib/match-states';
import { cn } from '@/lib/utils';

const QUALITY_TEXT: Record<MoveQuality, string> = {
  optimal: 'text-edu',
  good: 'text-p1',
  weak: 'text-warn',
  blunder: 'text-danger',
};
const QUALITY_RING: Record<MoveQuality, string> = {
  optimal: 'ring-2 ring-edu',
  good: 'ring-2 ring-p1',
  weak: 'ring-2 ring-warn',
  blunder: 'ring-2 ring-danger',
};

/** Public step-by-step replay player (SPEC §11) — no JWT, no API key. */
export function ReplayPage() {
  const t = useT();
  const path = useLocalePath();
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<ReplayMatch | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setStatus('loading');
    apiGet<ReplayMatch>(`/api/replay/${id}`)
      .then((m) => {
        if (alive) {
          setMatch(m);
          setStatus('ok');
        }
      })
      .catch((e) => {
        if (alive) setStatus((e as { status?: number }).status === 404 ? 'notfound' : 'error');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (status === 'loading') {
    return <p className="py-16 text-center font-mono text-sm text-dim">{t.replay.loading}</p>;
  }
  if (status === 'notfound' || !match) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="font-mono text-sm text-dim">{t.replay.notFound}</p>
        <Link to={path('arena')}>
          <Button variant="outline">{t.replay.openArena}</Button>
        </Link>
      </div>
    );
  }
  if (status === 'error') {
    return <p className="py-16 text-center font-mono text-sm text-danger">{t.replay.loadError}</p>;
  }

  return <ReplayPlayer match={match} />;
}

function ReplayPlayer({ match }: { match: ReplayMatch }) {
  const t = useT();
  const moves: AnalyzedMove[] = useMemo(
    () => match.moves.map((m) => ({ player: m.player, move: m.move })),
    [match.moves],
  );
  const log: MoveLogEntry[] = useMemo(
    () => match.moves.map((m, i) => ({ index: i, player: m.player, move: m.move, telemetry: m.telemetry })),
    [match.moves],
  );
  const analysis = useMemo(
    () => analyzeMatch(match.game, match.variant, match.setup, moves),
    [match.game, match.variant, match.setup, moves],
  );
  const states = useMemo(
    () => reconstructStates(match.game, match.variant, match.setup, moves),
    [match.game, match.variant, match.setup, moves],
  );
  const commentary = useMemo(() => parseCommentary(match.commentary), [match.commentary]);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clamp = (n: number) => Math.max(0, Math.min(moves.length, n));

  // Auto-play: advance one move per tick, stop at the end.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s >= moves.length) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 900);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, moves.length]);

  const currentMove = step > 0 ? analysis.moves[step - 1] : null;
  const p1 = shortSubject(match.p1Id);
  const p2 = shortSubject(match.p2Id);
  const nameOf = (side: PlayerSide) => (side === 'p1' ? p1 : p2);

  const result =
    match.winner === 'draw'
      ? t.replay.draw
      : match.winner === null
        ? '—'
        : `${nameOf(match.winner)} ${t.replay.wins}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t.replay.copied);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <SectionLabel>{t.replay.kicker}</SectionLabel>
          <h1 className="font-sans text-3xl font-bold uppercase tracking-tight sm:text-4xl">
            <span className="text-p1">{p1}</span>
            <span className="text-dim"> vs </span>
            <span className="text-p2">{p2}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>
              {t.games[match.game]} · {match.variant} · {t.replay.result}: {result}
            </span>
            {match.serverVerified && (
              <Badge className="bg-edu/15 text-edu">{t.replay.serverVerified}</Badge>
            )}
            {match.lab && <Badge className="bg-warn/15 text-warn">{t.replay.lab}</Badge>}
          </div>
        </div>
        <Button variant="outline" onClick={copyLink}>
          {t.replay.copyLink}
        </Button>
      </header>

      {/* Board + transport controls */}
      <HudPanel brackets className="flex flex-col items-center gap-4 p-5">
        {match.game === 'tictactoe' ? (
          <Board3x3
            board={(states[step] as TicTacToeState).board}
            lastMove={step > 0 ? (moves[step - 1].move as number) : null}
            lastMoveClass={currentMove ? QUALITY_RING[currentMove.quality] : undefined}
          />
        ) : (
          <BattleshipGodView state={states[step] as BattleshipState} p1={p1} p2={p2} />
        )}

        <div aria-live="polite" className="text-center font-mono text-sm">
          {currentMove ? (
            <span>
              #{step} {nameOf(currentMove.player)} → {formatMove(currentMove.move)} ·{' '}
              <span className={cn('font-bold uppercase', QUALITY_TEXT[currentMove.quality])}>
                {t.analysis.quality[currentMove.quality]}
              </span>
            </span>
          ) : (
            <span className="text-dim">{t.analysis.start}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep(0)} disabled={step === 0}>
            {t.analysis.first}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStep(clamp(step - 1))} disabled={step === 0}>
            {t.analysis.prev}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (step >= moves.length) setStep(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? t.replay.pause : t.replay.play}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(clamp(step + 1))}
            disabled={step === moves.length}
          >
            {t.analysis.next}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep(moves.length)}
            disabled={step === moves.length}
          >
            {t.analysis.last}
          </Button>
          <span className="min-w-16 text-center font-mono text-xs text-dim">
            {step}/{moves.length}
          </span>
        </div>
      </HudPanel>

      <TimelineChart log={log} />

      {/* Per-player precision + annotated move list */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(['p1', 'p2'] as const).map((side) => {
          const acc = analysis.accuracy[side];
          return (
            <HudPanel key={side} cut accent={side} className="flex items-center justify-between px-4 py-3">
              <span className={cn('font-sans font-bold', side === 'p1' ? 'text-p1' : 'text-p2')}>
                {nameOf(side)}
              </span>
              <span className="font-mono text-sm">
                {t.analysis.precision} {Math.round(acc.rate * 100)}% ({acc.optimal}/{acc.moves})
              </span>
            </HudPanel>
          );
        })}
      </div>

      <HudPanel className="p-4">
        <SectionLabel>{t.analysis.moveList}</SectionLabel>
        <ol className="mt-2 flex flex-wrap gap-1.5">
          {analysis.moves.map((m) => (
            <li key={m.index}>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setStep(m.index + 1);
                }}
                className={cn(
                  'clip-cut border bg-card-inset px-2 py-1 font-mono text-[11px] transition-colors',
                  step === m.index + 1 ? 'border-p1' : 'border-border',
                )}
                title={t.analysis.quality[m.quality]}
              >
                <span className={m.player === 'p1' ? 'text-p1' : 'text-p2'}>#{m.index + 1}</span>{' '}
                <span className={cn('font-bold', QUALITY_TEXT[m.quality])}>{formatMove(m.move)}</span>
              </button>
            </li>
          ))}
        </ol>
      </HudPanel>

      {/* §12.1 — commentary saved with the match is replayed with it. */}
      {commentary.length > 0 && (
        <HudPanel accent="edu" className="p-4">
          <SectionLabel className="text-edu">{t.commentator.section}</SectionLabel>
          <ol className="mt-2 flex flex-col gap-1.5">
            {commentary.map((c) => (
              <li key={c.moveIndex}>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setStep(c.moveIndex + 1);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 border-l-2 px-2 py-1.5 text-left transition-colors',
                    step === c.moveIndex + 1
                      ? 'border-edu bg-edu/10'
                      : 'border-edu/40 bg-edu/5 hover:bg-edu/10',
                  )}
                >
                  <span className="font-mono text-[11px] text-edu">#{c.moveIndex + 1}</span>
                  <span className="font-sans text-xs leading-snug text-edu/90">{c.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </HudPanel>
      )}
    </div>
  );
}

/** `matches.commentary` is untyped JSONB — validate before trusting it. */
function parseCommentary(raw: unknown): Commentary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is Commentary =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Commentary).moveIndex === 'number' &&
        typeof (c as Commentary).text === 'string',
    )
    .sort((a, b) => a.moveIndex - b.moveIndex);
}

function BattleshipGodView({ state, p1, p2 }: { state: BattleshipState; p1: string; p2: string }) {
  const v1 = battleship.viewFor(state, 'p1');
  const v2 = battleship.viewFor(state, 'p2');
  return (
    <div className="flex flex-wrap justify-center gap-6">
      <BattleshipBoard size={state.size} variant="own" accent="p1" title={p1} cells={v1.ownBoard} />
      <BattleshipBoard size={state.size} variant="own" accent="p2" title={p2} cells={v2.ownBoard} />
    </div>
  );
}
