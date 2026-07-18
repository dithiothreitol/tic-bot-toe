import { useEffect, useRef, useState } from 'react';

import { type TicTacToeState } from '@arena/game-core';

import { Board3x3 } from '@/components/Board3x3';
import { type MatchConfig, safetyMaxMovesFor } from '@/components/GameRunner';
import { Button } from '@/components/ui/button';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { type PlayerSpec, makePlayer } from '@/game/players';
import {
  type SeriesAggregate,
  type SeriesGameResult,
  emptyAggregate,
  runSeries,
} from '@/game/series';
import { useT } from '@/i18n';
import { formatCost } from '@/lib/format';
import { cn } from '@/lib/utils';

type Phase = 'running' | 'done';

/**
 * „Pojedynek promptów" runner (Module F, plan §8). Drives `runSeries` — the SAME
 * model over N games with two appendices, sides swapping each game — and shows a
 * live scoreboard + a final result card. Deliberately lightweight (no save /
 * prediction / commentary machinery): a duel is a local lab experiment (D10).
 */
export function SeriesRunner({
  config,
  onExit,
}: {
  config: MatchConfig;
  onExit: () => void;
}) {
  const t = useT();
  const series = config.series!;

  const [phase, setPhase] = useState<Phase>('running');
  const [games, setGames] = useState<SeriesGameResult[]>([]);
  const [agg, setAgg] = useState<SeriesAggregate>(emptyAggregate);
  const [board, setBoard] = useState<TicTacToeState['board'] | null>(null);
  const [currentGame, setCurrentGame] = useState(0);
  const aborter = useRef<AbortController | null>(null);
  // Re-run token: bumping it restarts the effect for "again". It also shifts the
  // seed, so a re-run is a genuinely fresh series (not a byte-identical replay).
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    aborter.current = abort;
    setPhase('running');
    setGames([]);
    setAgg(emptyAggregate());
    setBoard(null);
    setCurrentGame(0);

    // Both sides are the SAME model; only the appendix differs (A vs B). The duel
    // is model_vs_model, so p1 is always an LLM spec (never human). Reasoning is
    // folded in like GameRunner does.
    const base = config.p1 as Extract<PlayerSpec, { kind: 'openrouter' | 'webllm' | 'ollama' }>;
    const buildPlayer = (appendix: string) =>
      makePlayer({ ...base, systemAppendix: appendix, reasoning: config.reasoning }).player;

    // Defer the actual start to a microtask so React 18 StrictMode's
    // mount→cleanup→mount cycle aborts the first (throwaway) attempt BEFORE it
    // fires a real LLM call — otherwise every dev mount burns one getMove.
    queueMicrotask(() => {
      if (abort.signal.aborted) return;
      void runSeries({
        game: config.game,
        variant: config.variant,
        seriesLength: series.seriesLength,
        // Shift the seed per re-run so "Again" is a new series, not a replay.
        seriesSeed: series.seriesSeed + runId * 10007,
        appendixA: series.appendixA,
        appendixB: series.appendixB,
        buildPlayer,
        extraShotOnHit: config.extraShotOnHit,
        safetyMaxMoves: safetyMaxMovesFor(config.game, config.variant),
        maxConsecutiveForfeits: config.safety?.maxConsecutiveForfeits || undefined,
        maxTokens: config.safety?.maxTokens || undefined,
        signal: abort.signal,
        onMove: (_entry, snap, gameIndex) => {
          if (abort.signal.aborted) return; // no setState after unmount/abort
          setCurrentGame(gameIndex);
          if (config.game === 'tictactoe') setBoard((snap.state as TicTacToeState).board);
        },
        onGameEnd: (result, running) => {
          if (abort.signal.aborted) return;
          setGames((g) => [...g, result]);
          setAgg({ ...running });
        },
      }).finally(() => {
        if (!abort.signal.aborted) setPhase('done');
      });
    });

    return () => abort.abort();
  }, [config, series, runId]);

  const stop = () => {
    aborter.current?.abort();
    setPhase('done');
  };

  const modelName = config.names.p1;
  const leader =
    agg.aWins > agg.bWins ? 'A' : agg.bWins > agg.aWins ? 'B' : 'tie';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <SectionLabel>{t.lab.duel.kicker}</SectionLabel>
          <h1 className="font-sans text-3xl font-bold uppercase tracking-tight sm:text-4xl">
            <span className="text-p1">{t.lab.duel.promptAShort}</span>
            <span className="text-dim"> vs </span>
            <span className="text-p2">{t.lab.duel.promptBShort}</span>
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            {t.lab.duel.subtitle(modelName, series.seriesLength)}
          </p>
        </div>
        <div className="flex gap-2">
          {phase === 'running' ? (
            <Button variant="outline" onClick={stop}>
              {t.control.stop}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setRunId((n) => n + 1)}>
                {t.lab.duel.again}
              </Button>
              <Button variant="outline" onClick={onExit}>
                {t.lab.duel.back}
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Scoreboard */}
      <HudPanel className="flex flex-wrap items-center justify-center gap-8 p-5">
        <Score label={t.lab.duel.promptAShort} value={agg.aWins} color="text-p1" lead={leader === 'A'} />
        <Score label={t.lab.duel.draws} value={agg.draws} color="text-dim" lead={false} />
        <Score label={t.lab.duel.promptBShort} value={agg.bWins} color="text-p2" lead={leader === 'B'} />
      </HudPanel>

      {/* Per-game tiles — which prompt won each game, and who moved first. */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: series.seriesLength }).map((_, i) => {
          const g = games[i];
          const label =
            g === undefined
              ? i === currentGame && phase === 'running'
                ? '…'
                : ''
              : g.promptWinner === 'draw' || g.promptWinner === null
                ? '='
                : g.promptWinner;
          const tone =
            g === undefined
              ? 'border-border text-dim'
              : g.promptWinner === 'A'
                ? 'border-p1 text-p1'
                : g.promptWinner === 'B'
                  ? 'border-p2 text-p2'
                  : 'border-border text-muted-foreground';
          return (
            <div
              key={i}
              className={cn(
                'clip-cut flex h-12 w-12 flex-col items-center justify-center border bg-card-inset font-mono',
                tone,
              )}
              title={g ? t.lab.duel.gameStarter(g.aSide === 'p1' ? 'A' : 'B') : undefined}
            >
              <span className="text-[9px] text-dim">#{i + 1}</span>
              <span className="text-sm font-bold">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Live board of the current game (tic-tac-toe only). */}
      {phase === 'running' && config.game === 'tictactoe' && board && (
        <HudPanel brackets className="flex flex-col items-center gap-2 p-5">
          <p className="font-mono text-xs text-dim">
            {t.lab.duel.gameInProgress(currentGame + 1, series.seriesLength)}
          </p>
          <Board3x3 board={board} />
        </HudPanel>
      )}

      {/* Final result card — prompts stay ABSTRACT here (text is local, D10). */}
      {phase === 'done' && (
        <HudPanel brackets accent="edu" className="flex flex-col gap-3 p-6">
          <SectionLabel className="text-edu">{t.lab.duel.resultKicker}</SectionLabel>
          <p className="font-sans text-2xl font-bold text-edu text-glow-edu">
            {leader === 'tie'
              ? t.lab.duel.resultTie
              : t.lab.duel.resultWin(leader === 'A' ? t.lab.duel.promptAShort : t.lab.duel.promptBShort)}
          </p>
          <p className="font-mono text-sm text-muted-foreground">
            {t.lab.duel.resultLine(modelName, agg.games, agg.aWins, agg.bWins, agg.draws)}
          </p>
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-3 font-mono text-xs">
            <PromptStats label={t.lab.duel.promptAShort} color="text-p1" tokens={agg.tokensA} cost={agg.costA} forfeits={agg.forfeitA} t={t} />
            <PromptStats label={t.lab.duel.promptBShort} color="text-p2" tokens={agg.tokensB} cost={agg.costB} forfeits={agg.forfeitB} t={t} />
          </div>
        </HudPanel>
      )}
    </div>
  );
}

function Score({
  label,
  value,
  color,
  lead,
}: {
  label: string;
  value: number;
  color: string;
  lead: boolean;
}) {
  // The lead glow follows the side's own colour — a leading Prompt B glows
  // magenta, not cyan.
  const glow = color === 'text-p2' ? 'text-glow-p2' : 'text-glow-p1';
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn('font-sans text-4xl font-bold', color, lead && glow)}>{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</span>
    </div>
  );
}

function PromptStats({
  label,
  color,
  tokens,
  cost,
  forfeits,
  t,
}: {
  label: string;
  color: string;
  tokens: number;
  cost: number;
  forfeits: number;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={cn('font-bold', color)}>{label}</span>
      <span className="text-dim">
        {t.lab.duel.tokens}: <span className="text-foreground">{tokens}</span>
      </span>
      <span className="text-dim">
        {t.lab.duel.cost}: <span className="text-foreground">{cost > 0 ? formatCost(cost) : '—'}</span>
      </span>
      <span className="text-dim">
        {t.lab.duel.forfeits}: <span className="text-foreground">{forfeits}</span>
      </span>
    </div>
  );
}
