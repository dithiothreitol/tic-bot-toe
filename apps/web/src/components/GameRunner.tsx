import { useEffect, useRef, useState } from 'react';

import {
  type BattleshipState,
  type GameId,
  type GameStatus,
  type Move,
  type PlayerSide,
  type SetupConfig,
  type SetupRecord,
  type TicTacToeCell,
  type TicTacToeState,
  type Variant,
  battleship,
  getBattleshipVariant,
  ticTacToe,
} from '@arena/game-core';

import { AnalysisView } from '@/components/AnalysisView';
import { Board3x3 } from '@/components/Board3x3';
import { BattleshipBoard } from '@/components/BattleshipBoard';
import { TimelineChart } from '@/components/charts/TimelineChart';
import { GameLog } from '@/components/GameLog';
import { ShipPlacement } from '@/components/ShipPlacement';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Identicon } from '@/components/Identicon';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import {
  type MatchMode,
  type MatchOutcome,
  type MatchSnapshot,
  type MoveLogEntry,
  runMatch,
} from '@/game/orchestrator';
import { type PlayerSpec, makePlayer } from '@/game/players';
import { toast } from 'sonner';

import { ApiError, type SaveResultResponse } from '@/api/client';
import {
  type DailyClaim,
  type PredictedSide,
  type PredictionResult,
  claimDaily,
  submitPrediction,
} from '@/api/community';
import { pingLive, reportFinish, stopLive } from '@/api/live';
import { fetchStartToken } from '@/api/match';
import { saveResult } from '@/api/results';
import {
  type Commentary,
  type Commentator,
  chatCommentate,
  classifyLastMove,
  createCommentator,
  serverCommentate,
  shouldComment,
} from '@/providers/commentator';
import type { ChatTransport } from '@/providers/llm-runner';
import { createOllamaTransport } from '@/providers/ollama';
import { createOpenRouterTransport } from '@/providers/openrouter';
import { createWebLlmTransport } from '@/providers/webllm';
import { getOpenRouterKey } from '@/store/settings';
import { type Dict, useLocale, useLocalePath, useT } from '@/i18n';
import { randomToken } from '@/lib/id';
import { formatCost, formatMs, formatTokens } from '@/lib/format';
import { type SideTotals, sideTotals } from '@/lib/telemetry';
import { cn } from '@/lib/utils';
import type { HumanPlayerHandle } from '@/providers/human';
import { clearSession, ensureSession } from '@/store/session';

function priceSnapshotFor(config: MatchConfig): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const spec of [config.p1, config.p2]) {
    if (spec.kind === 'openrouter' && spec.price) snap[`openrouter:${spec.model}`] = spec.price;
  }
  return snap;
}

function shortId(id: string): string {
  return id.replace(/^(openrouter|webllm):/, '');
}

function fmtDelta(d: number): string {
  const r = Math.round(d);
  return r >= 0 ? `+${r}` : `${r}`;
}

/** The path is locale-dependent (`/replay/:id` vs `/en/replay/:id`), so the caller
 *  builds it and the copy comes with it. */
async function copyReplayLink(path: string, copied: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast.success(copied);
  } catch {
    /* clipboard unavailable — ignore */
  }
}

const EMPTY_TTT: TicTacToeCell[] = Array<TicTacToeCell>(9).fill(null);

/**
 * How often a running match reports itself to the home-page "live" counter.
 * Comfortably inside the server's entry TTL (see server `lib/live`), so a single
 * dropped beat never makes the match blink out of the count.
 */
const LIVE_BEAT_MS = 20_000;

export interface MatchConfig {
  game: GameId;
  variant: Variant;
  mode: MatchMode;
  p1: PlayerSpec;
  p2: PlayerSpec;
  names: { p1: string; p2: string };
  seed: number;
  extraShotOnHit?: boolean;
  /** Prompt-lab match (§12.4): excluded from Elo, kept for replays. */
  lab?: boolean;
  /**
   * Give the models a short chain-of-thought + a higher token budget so they
   * play near their real strength (SPEC §8 default forbids reasoning). Applied
   * to every LLM in the match. Excluded from Elo — saved as a lab match — so the
   * default no-reasoning ranking stays comparable.
   */
  reasoning?: boolean;
  /** Started from the daily-challenge tile (§12.6) — a win claims the day. */
  daily?: boolean;
  /** AI commentator (§12.1) — off unless the user picked a model. Never a player. */
  commentator?: CommentatorSpec;
}

/**
 * Where the commentator's words come from (§12.1). Either the user's own model
 * on their own key (`byok`), or the app-funded server coach (`server`, Gemini —
 * the key is a server secret the browser never sees).
 */
export type CommentatorSpec =
  | { source: 'byok'; provider: 'openrouter' | 'webllm' | 'ollama'; id: string; name: string }
  | { source: 'server' };

/** BYOK commentator transport — same providers as the players, on the user's key. */
function commentatorTransport(
  spec: Extract<CommentatorSpec, { source: 'byok' }>,
  apiKey: string | null,
): ChatTransport {
  const tuning = { temperature: 0.7, maxTokens: 90 };
  if (spec.provider === 'webllm') return createWebLlmTransport(spec.id, tuning);
  if (spec.provider === 'ollama') return createOllamaTransport(spec.id, tuning);
  return createOpenRouterTransport({ model: spec.id, apiKey: apiKey ?? '', ...tuning });
}

function humanSideOf(config: MatchConfig): PlayerSide | null {
  if (config.p1.kind === 'human') return 'p1';
  if (config.p2.kind === 'human') return 'p2';
  return null;
}

function statusToWinnerSide(status: GameStatus): PlayerSide | null {
  if (status === 'p1_won') return 'p1';
  if (status === 'p2_won') return 'p2';
  return null;
}

/**
 * A model that can't move forfeits to a random legal move (§8). Left silent,
 * that reads as "only the algorithm plays" — a key can pass the validity test
 * yet still 402/429 on every completion. So when a forfeit names a cause, say
 * so: what happened, to which model, and that the moves are now random. `null`
 * for a plain forfeit with no known cause (nothing actionable to add).
 */
function forfeitToast(
  entry: MoveLogEntry,
  names: { p1: string; p2: string },
  t: Dict,
): { message: string; hard: boolean } | null {
  const reason = entry.telemetry.error;
  if (!entry.telemetry.forfeit || !reason) return null;
  const name = entry.player === 'p1' ? names.p1 : names.p2;
  const message = `${t.moveError[reason].replace('{name}', name)} ${t.moveError.playingRandom}`;
  // A config problem (no credits / bad key / dead model) needs the user to act;
  // the rest is transient noise from the provider.
  const hard = reason === 'no_credits' || reason === 'auth' || reason === 'unavailable';
  return { message, hard };
}

/** Turn an anti-bot rejection (§15.3) into something a person can act on. */
function saveErrorMessage(e: unknown, t: Dict): string {
  const reason = e instanceof ApiError ? e.message : '';
  if (reason === 'too_fast_for_human') return t.result.saveTooFast;
  if (reason === 'daily_limit' || reason === 'daily_limit_ip') return t.result.saveDailyLimit;
  if (reason === 'missing_start_token') return t.result.saveNoStart;
  return t.result.saveError;
}

export function GameRunner({
  config,
  onExit,
}: {
  config: MatchConfig;
  onExit: () => void;
}) {
  const t = useT();
  const path = useLocalePath();
  const locale = useLocale();
  const [state, setState] = useState<unknown>(null);
  const [log, setLog] = useState<MoveLogEntry[]>([]);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [toMove, setToMove] = useState<PlayerSide>('p1');
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [placement, setPlacement] = useState<number[][] | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveResponse, setSaveResponse] = useState<SaveResultResponse | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const humansRef = useRef<Partial<Record<PlayerSide, HumanPlayerHandle>>>({});
  /** Server-stamped start of this match — proves the person really spent the time (§15.3). */
  const startTokenRef = useRef<string | null>(null);
  /** Opaque per-match id for the home-page live counter — no identity is sent. */
  const liveIdRef = useRef<string>('');
  if (!liveIdRef.current) liveIdRef.current = randomToken();
  /** Forfeit reasons already surfaced this match, so a persistent failure (e.g.
   *  every move 402s) toasts once per cause instead of once per move. */
  const forfeitToastedRef = useRef<Set<string>>(new Set());
  /** Match id already reported to the cumulative finished-games counter, so a
   *  re-render never counts the same match twice. */
  const finishReportedRef = useRef<string>('');

  /**
   * Viewer prediction (§12.5). The bet must be placed BEFORE the first move, so
   * the match itself is gated on it: `pending` blocks the run loop until the
   * viewer picks a side or skips. Only meaningful for model vs model.
   */
  const [prediction, setPrediction] = useState<PredictedSide | 'pending' | 'skipped'>(
    config.mode === 'model_vs_model' ? 'pending' : 'skipped',
  );
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [dailyClaim, setDailyClaim] = useState<DailyClaim | null>(null);
  /** Commentator bubbles (§12.1), keyed by the move they belong to. */
  const [commentary, setCommentary] = useState<Commentary[]>([]);

  const humanSide = humanSideOf(config);
  const needsPlacement =
    config.game === 'battleship' && humanSide !== null && placement === null;
  const needsPrediction = prediction === 'pending';

  useEffect(() => {
    if (needsPlacement || needsPrediction) return;

    const abort = new AbortController();
    const humans: Partial<Record<PlayerSide, HumanPlayerHandle>> = {};
    const build = (spec: PlayerSpec, side: PlayerSide) => {
      // Reasoning is a match-level toggle; fold it into every LLM spec here so
      // the setup screen doesn't have to stamp it on each side. Human has no prompt.
      const withReasoning: PlayerSpec =
        spec.kind === 'human' ? spec : { ...spec, reasoning: config.reasoning };
      const built = makePlayer(withReasoning);
      if (built.human) humans[side] = built.human;
      return built.player;
    };
    const players = { p1: build(config.p1, 'p1'), p2: build(config.p2, 'p2') };
    humansRef.current = humans;

    setState(null);
    setLog([]);
    setStatus('playing');
    setToMove('p1');
    setOutcome(null);
    setSaveState('idle');
    setSaveResponse(null);
    setShowAnalysis(false);
    setPredictionResult(null);
    setDailyClaim(null);
    setCommentary([]);
    forfeitToastedRef.current = new Set();
    // A fresh id per match: the live counter treats each match as its own slot,
    // and the finish report below dedups per match rather than per session.
    liveIdRef.current = randomToken();

    // §12.1 — a third model narrating. It never enters `players`, so it cannot
    // influence a single move; it only watches. Comments land asynchronously.
    let commentator: Commentator | null = null;
    if (config.commentator) {
      const spec = config.commentator;
      // The user reads the commentary, so it is written in the UI language.
      // BYOK builds the prompt here; the server coach builds it server-side.
      const commentate =
        spec.source === 'server'
          ? serverCommentate(locale)
          : chatCommentate(commentatorTransport(spec, getOpenRouterKey()), locale);
      // When the funded coach runs out of its hourly quota, nudge toward BYOK —
      // once per match, and never for the BYOK path (which has no such limit).
      let nudgedLimit = false;
      const onError =
        spec.source === 'server'
          ? (e: unknown) => {
              if (!nudgedLimit && e instanceof ApiError && e.status === 429) {
                nudgedLimit = true;
                toast.info(t.commentator.serverLimited);
              }
            }
          : undefined;
      commentator = createCommentator({
        commentate,
        onError,
        modelId: spec.source === 'server' ? 'server' : `${spec.provider}:${spec.id}`,
        onComment: (c) =>
          setCommentary((prev) =>
            prev.some((x) => x.moveIndex === c.moveIndex) ? prev : [...prev, c],
          ),
      });
    }

    // Stamp the start of a human match server-side (§15.3). Best-effort and
    // non-blocking: the game runs regardless, only the ranking save needs it.
    startTokenRef.current = null;
    if (humanSide !== null) {
      void fetchStartToken().then((token) => {
        startTokenRef.current = token;
      });
    }

    const setupConfig: SetupConfig = {
      seed: config.seed + restartKey,
      extraShotOnHit: config.extraShotOnHit,
      placements: humanSide && placement ? { [humanSide]: placement } : undefined,
    };
    const size =
      config.game === 'battleship' ? getBattleshipVariant(config.variant.id).size : 3;

    const applySnap = (snap: MatchSnapshot) => {
      setState(snap.state);
      setStatus(snap.status);
      setToMove(snap.toMove);
    };

    /** State BEFORE the move currently being reported — needed to grade it. */
    let prevState: unknown = null;

    void runMatch({
      mode: config.mode,
      game: config.game,
      variant: config.variant,
      config: setupConfig,
      players,
      signal: abort.signal,
      safetyMaxMoves: config.game === 'battleship' ? 2 * size * size : 9,
      onStart: (snap) => {
        applySnap(snap);
        prevState = snap.state;
      },
      onMove: (entry, snap) => {
        setLog((l) => [...l, entry]);
        applySnap(snap);

        // A forfeit with a named cause is why the match "only plays algo" — tell
        // the user once per cause, not once per move.
        const forfeit = forfeitToast(entry, config.names, t);
        if (forfeit && entry.telemetry.error && !forfeitToastedRef.current.has(entry.telemetry.error)) {
          forfeitToastedRef.current.add(entry.telemetry.error);
          (forfeit.hard ? toast.error : toast.warning)(forfeit.message, { duration: 8000 });
        }

        if (commentator && prevState !== null) {
          const quality = classifyLastMove(config.game, prevState, entry.player, entry.move);
          const isFinal = snap.status !== 'playing';
          if (shouldComment(entry.index, quality, isFinal)) {
            const winner = isFinal ? statusToWinnerSide(snap.status) : null;
            // Fire-and-forget: this returns instantly, the match never waits (§12.1).
            commentator.enqueue({
              game: config.game,
              moveIndex: entry.index,
              player: entry.player,
              playerName: entry.player === 'p1' ? config.names.p1 : config.names.p2,
              move: entry.move,
              quality,
              state: snap.state,
              isFinal,
              winnerName: winner ? config.names[winner] : null,
            });
          }
        }
        prevState = snap.state;
      },
      onEnd: setOutcome,
    });

    return () => {
      abort.abort();
      commentator?.stop();
    };
  }, [config, restartKey, placement, needsPlacement, needsPrediction, humanSide]);

  // Feed the home-page "live" counter while the match is actually being played.
  // Best-effort heartbeat: it pings on start and every LIVE_BEAT_MS, and drops the
  // match the moment it ends or the component unmounts. Kept out of the run-loop
  // effect above so a beat never perturbs the game itself.
  const matchLive =
    !needsPlacement && !needsPrediction && status === 'playing' && outcome === null;
  useEffect(() => {
    if (!matchLive) return;
    const id = liveIdRef.current;
    const mode = config.mode;
    const ctrl = new AbortController();
    const beat = () => void pingLive(id, mode, { signal: ctrl.signal });
    beat();
    const interval = window.setInterval(beat, LIVE_BEAT_MS);
    return () => {
      window.clearInterval(interval);
      ctrl.abort();
      stopLive(id);
    };
  }, [matchLive, config.mode]);

  // Count every match that actually finishes (a winner or a draw) toward the
  // home-page "games / tokens burned" totals — once per match, and regardless of
  // whether the player goes on to save it to the ranking. Aborted matches (tab
  // closed mid-game, reset before the end) don't count as played.
  useEffect(() => {
    if (!outcome || outcome.aborted) return;
    const id = liveIdRef.current;
    if (finishReportedRef.current === id) return;
    finishReportedRef.current = id;
    const tokens = log.reduce(
      (sum, m) => sum + (m.telemetry.promptTokens ?? 0) + (m.telemetry.completionTokens ?? 0),
      0,
    );
    reportFinish(id, config.mode, config.game, tokens);
  }, [outcome, log, config.mode, config.game]);

  const isHumanTurn =
    status === 'playing' && outcome === null && humansRef.current[toMove] !== undefined;
  const thinking =
    status === 'playing' && outcome === null && humansRef.current[toMove] === undefined;
  const activeName = toMove === 'p1' ? config.names.p1 : config.names.p2;
  const submit = (move: Move) => humansRef.current[toMove]?.submit(move);

  const totalCost = log.reduce((sum, m) => sum + (m.telemetry.costUsd ?? 0), 0);
  const hasCost = log.some((m) => m.telemetry.costUsd !== undefined);

  const rematch = () => {
    setPlacement(null);
    setPrediction(config.mode === 'model_vs_model' ? 'pending' : 'skipped');
    setRestartKey((k) => k + 1);
  };

  const savable = outcome !== null && !outcome.aborted && outcome.winner !== null;

  const handleSave = async () => {
    if (!outcome) return;
    setSaveState('saving');
    try {
      // Take the session token up front: the save burns its jti and clears the
      // session, and the prediction below still needs a valid JWT (§14). Reusing
      // it here means at most one Turnstile per match.
      const session = await ensureSession();
      const resp = await saveResult(outcome, {
        priceSnapshot: priceSnapshotFor(config),
        // Reasoning changes how strong the models play, so those games must not
        // move Elo — save them as lab, exactly like the prompt lab (§12.4).
        lab: config.lab || config.reasoning,
        startToken: startTokenRef.current ?? undefined,
        // §12.1 — commentary is opt-in content, so it rides along only when present.
        commentary: commentary.length > 0 ? [...commentary].sort((a, b) => a.moveIndex - b.moveIndex) : undefined,
      });
      setSaveResponse(resp);
      setSaveState('saved');
      // The session jti is burned by a successful save; drop it so the next save
      // re-verifies through Turnstile instead of failing with jti_used.
      clearSession();

      // §12.5 — score the bet against the winner the SERVER just replayed.
      if (prediction !== 'pending' && prediction !== 'skipped') {
        try {
          setPredictionResult(await submitPrediction(resp.matchId, prediction, session));
        } catch {
          /* points are a bonus, never a reason to fail the save */
        }
      }

      // §12.6 — a won daily challenge claims the day and extends the streak.
      if (config.daily && humanSide !== null && outcome.winner === humanSide) {
        try {
          const claim = await claimDaily(resp.matchId);
          setDailyClaim(claim);
          toast.success(`${t.daily.claimed}${claim.streak}`);
        } catch {
          toast.error(t.daily.claimError);
        }
      }
    } catch (e) {
      setSaveState('idle');
      if ((e as Error).message !== 'anulowano') toast.error(saveErrorMessage(e, t));
    }
  };

  const statusLine = (() => {
    if (outcome) {
      if (outcome.winner === null) return t.status.aborted;
      if (outcome.winner === 'draw') return t.status.draw;
      if (humanSide) return outcome.winner === humanSide ? t.result.youWon : t.result.youLost;
      const name = outcome.winner === 'p1' ? config.names.p1 : config.names.p2;
      return `${t.status.wins}: ${name}`;
    }
    if (thinking) return `${activeName} ${t.status.thinking}`;
    if (isHumanTurn) return t.status.yourTurn;
    return `${t.status.turn}: ${activeName}`;
  })();

  const header = (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={onExit}>
        ← {t.result.backToSetup}
      </Button>
      <span className="flex items-center gap-2">
        {config.lab && (
          <span className="clip-cut border border-edu/50 bg-edu/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-edu">
            {t.lab.badge}
          </span>
        )}
        {config.reasoning && (
          <span className="clip-cut border border-p2/50 bg-p2/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-p2">
            {t.reasoning.badge}
          </span>
        )}
        {prediction !== 'pending' && prediction !== 'skipped' && (
          <span className="clip-cut border border-border bg-card-inset px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim">
            {t.prediction.locked}:{' '}
            <span
              className={cn(
                'font-bold',
                prediction === 'p1' && 'text-p1',
                prediction === 'p2' && 'text-p2',
              )}
            >
              {prediction === 'draw'
                ? t.prediction.draw
                : prediction === 'p1'
                  ? config.names.p1
                  : config.names.p2}
            </span>
          </span>
        )}
        <span className="section-label">
          {t.games[config.game]} ·{' '}
          {config.mode === 'model_vs_model' ? t.mode.modelVsModel : t.mode.humanVsModel}
        </span>
      </span>
    </div>
  );

  const slotSymbol = (side: PlayerSide): string =>
    config.game === 'tictactoe' ? (side === 'p1' ? 'X' : 'O') : '⚓';
  /** Identicon seed: the model id, so the same model always looks the same. */
  const slotSeed = (side: PlayerSide): string => {
    const spec = side === 'p1' ? config.p1 : config.p2;
    return spec.kind === 'human' ? 'human' : spec.model;
  };
  const activeSide = (side: PlayerSide): boolean =>
    outcome ? outcome.winner === side : status === 'playing' && toMove === side;

  const playerSlots = (
    <div className="grid grid-cols-2 gap-3">
      {(['p1', 'p2'] as const).map((side) => (
        <PlayerSlot
          key={side}
          side={side}
          name={side === 'p1' ? config.names.p1 : config.names.p2}
          seed={slotSeed(side)}
          symbol={slotSymbol(side)}
          active={activeSide(side)}
          totals={sideTotals(log, side)}
        />
      ))}
    </div>
  );

  // §12.5 — the bet is placed before the match exists, so nothing can leak.
  if (needsPrediction) {
    return (
      <div className="flex w-full flex-col gap-4">
        {header}
        {playerSlots}
        <HudPanel brackets accent="edu" className="flex flex-col items-center gap-4 p-6">
          <SectionLabel className="text-edu">{t.prediction.kicker}</SectionLabel>
          <p className="font-sans text-xl font-bold uppercase tracking-tight">
            {t.prediction.question}
          </p>
          <p className="max-w-prose text-center text-sm text-muted-foreground">
            {t.prediction.lead}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              className="border-p1 bg-p1/15 text-p1 hover:bg-p1/25"
              onClick={() => setPrediction('p1')}
            >
              {config.names.p1}
            </Button>
            <Button variant="outline" onClick={() => setPrediction('draw')}>
              {t.prediction.draw}
            </Button>
            <Button
              className="border-p2 bg-p2/15 text-p2 hover:bg-p2/25"
              onClick={() => setPrediction('p2')}
            >
              {config.names.p2}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPrediction('skipped')}>
            {t.prediction.skip}
          </Button>
        </HudPanel>
      </div>
    );
  }

  if (needsPlacement) {
    const vc = getBattleshipVariant(config.variant.id);
    return (
      <div className="flex w-full flex-col gap-4">
        {header}
        <Card>
          <CardContent className="pt-6">
            <ShipPlacement
              size={vc.size}
              fleet={vc.fleet}
              accent={humanSide === 'p1' ? 'p1' : 'p2'}
              onConfirm={setPlacement}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const live = status === 'playing' && outcome === null;

  return (
    <div className="flex w-full flex-col gap-4">
      {header}
      {playerSlots}
      <div className="grid gap-4 md:grid-cols-[minmax(0,auto)_1fr]">
        <HudPanel
          brackets
          scanner={live}
          accent={thinking && toMove === 'p2' ? 'p2' : 'p1'}
          className="flex flex-col items-center gap-4 p-5"
        >
          <p
            aria-live="polite"
            className={cn(
              'flex items-center gap-2 text-center font-mono text-sm',
              outcome?.winner === 'p1' && 'text-p1',
              outcome?.winner === 'p2' && 'text-p2',
            )}
          >
            {thinking && <ThinkDots side={toMove} />}
            {statusLine}
          </p>

          {config.game === 'tictactoe' ? (
            <TicTacToeArena
              state={state as TicTacToeState | null}
              interactive={isHumanTurn}
              toMove={toMove}
              onPlay={(cell) => submit(cell)}
            />
          ) : (
            <BattleshipArena
              state={state as BattleshipState | null}
              mode={config.mode}
              humanSide={humanSide}
              canFire={isHumanTurn}
              toMove={toMove}
              names={config.names}
              onFire={(coord) => submit(coord)}
            />
          )}

          {hasCost && (
            <p className="font-mono text-xs text-muted-foreground">
              {t.result.cost}: {formatCost(totalCost)}
            </p>
          )}
        </HudPanel>

        <HudPanel className="min-w-0 p-4">
          <GameLog moves={log} names={config.names} commentary={commentary} />
        </HudPanel>
      </div>

      <TimelineChart log={log} live={live} />

      {outcome && (
        <div className="flex flex-col items-center gap-3">
          {savable && saveState !== 'saved' && (
            <Button onClick={handleSave} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? t.result.saving : t.result.save}
            </Button>
          )}
          {/* §12.5 — a bet only scores once the match is saved and replayed. */}
          {savable && saveState !== 'saved' && prediction !== 'skipped' && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-dim">
              {t.prediction.saveHint}
            </p>
          )}
          {predictionResult && (
            <p
              className={cn(
                'font-sans text-sm font-bold uppercase tracking-wide',
                predictionResult.correct ? 'text-edu text-glow-edu' : 'text-danger',
              )}
            >
              {predictionResult.correct ? t.prediction.hit : t.prediction.miss}
            </p>
          )}
          {dailyClaim && (
            <p className="font-sans text-sm font-bold uppercase tracking-wide text-edu text-glow-edu">
              ✓ {t.daily.done} · {t.daily.streak}: {dailyClaim.streak}
            </p>
          )}
          {/* Saved, but out of the ranking — say WHY, never fail silently. */}
          {saveResponse && !saveResponse.ranked && (
            <div className="flex max-w-prose flex-col items-center gap-1 text-center">
              <span className="font-mono text-xs uppercase tracking-wide text-warn">
                {t.result.savedUnranked}
              </span>
              <span className="text-xs text-muted-foreground">
                {saveResponse.unrankedReason === 'no_real_moves'
                  ? t.result.unrankedNoRealMoves
                  : t.result.unrankedLab}
              </span>
            </div>
          )}
          {saveResponse && saveResponse.ratingChanges.length > 0 && (
            <div className="flex flex-col items-center gap-1 font-mono text-xs">
              <span className="text-edu text-glow-edu uppercase tracking-wide">
                {t.result.saved}
              </span>
              {saveResponse.ratingChanges.map((rc) => {
                const delta = rc.after - rc.before;
                return (
                  <span key={rc.subjectId} className="text-muted-foreground">
                    {shortId(rc.subjectId)}: {Math.round(rc.before)} →{' '}
                    {Math.round(rc.after)}{' '}
                    <span className={delta >= 0 ? 'text-edu' : 'text-danger'}>
                      ({fmtDelta(delta)})
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          {saveResponse && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void copyReplayLink(path('replay', saveResponse.matchId), t.replay.copied)
                }
              >
                🔗 {t.replay.copyLink}
              </Button>
              <a
                href={path('replay', saveResponse.matchId)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-p1 underline-offset-2 hover:underline"
              >
                {path('replay', saveResponse.matchId.slice(0, 8))}…
              </a>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={rematch}>{t.result.rematch}</Button>
            {log.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowAnalysis((v) => !v)}
              >
                {showAnalysis ? t.result.closeAnalysis : t.result.analyze}
              </Button>
            )}
            <Button variant="outline" onClick={onExit}>
              {t.result.backToSetup}
            </Button>
          </div>
        </div>
      )}

      {outcome && showAnalysis && (
        <AnalysisView
          config={config}
          log={log}
          setup={
            config.game === 'battleship' && state
              ? (battleship.serializeSetup(state as BattleshipState) as SetupRecord)
              : null
          }
        />
      )}
    </div>
  );
}

/** Two-diamond "model is thinking" indicator in the active player's color. */
function ThinkDots({ side }: { side: PlayerSide }) {
  const color = side === 'p1' ? 'bg-p1' : 'bg-p2';
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className={cn('size-1.5 rounded-full', color)}
          style={{ animation: `think 1s ease-in-out ${delay}s infinite` }}
        />
      ))}
    </span>
  );
}

/** Player slot (DESIGN screen 02): swatch + name + PLAYER_0n · symbol. */
function PlayerSlot({
  side,
  name,
  seed,
  symbol,
  active,
  totals,
}: {
  side: PlayerSide;
  name: string;
  /** Stable subject id — the identicon pattern is derived from it (SPEC §4). */
  seed: string;
  symbol: string;
  active: boolean;
  totals: SideTotals;
}) {
  const isP1 = side === 'p1';
  return (
    <HudPanel
      cut
      accent={isP1 ? 'p1' : 'p2'}
      className={cn(
        'flex items-center gap-3 px-4 py-3 transition-shadow',
        active && (isP1 ? 'glow-p1' : 'glow-p2'),
      )}
    >
      <Identicon seed={seed} accent={isP1 ? 'p1' : 'p2'} />
      <div className="min-w-0">
        <div className="truncate font-sans font-bold tracking-wide">{name}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {isP1 ? 'Player_01' : 'Player_02'} · {symbol}
        </div>
        {totals.moves > 0 && (
          // Running cost of this side's thinking, visible during the match.
          <div className="font-mono text-[10px] tracking-wider text-dim">
            {formatMs(totals.latencyMs)} ·{' '}
            {totals.tokens === null ? '—' : `${formatTokens(totals.tokens)} tok`}
          </div>
        )}
      </div>
    </HudPanel>
  );
}

function TicTacToeArena({
  state,
  interactive,
  toMove,
  onPlay,
}: {
  state: TicTacToeState | null;
  interactive: boolean;
  toMove: PlayerSide;
  onPlay: (cell: number) => void;
}) {
  const board = state?.board ?? EMPTY_TTT;
  const legal = interactive && state ? ticTacToe.legalMoves(state, toMove) : [];
  const lastMove = state && state.moves.length > 0 ? state.moves[state.moves.length - 1] : null;
  return (
    <Board3x3 board={board} interactive={legal} onCellClick={onPlay} lastMove={lastMove} />
  );
}

function BattleshipArena({
  state,
  mode,
  humanSide,
  canFire,
  toMove,
  names,
  onFire,
}: {
  state: BattleshipState | null;
  mode: MatchMode;
  humanSide: PlayerSide | null;
  canFire: boolean;
  toMove: PlayerSide;
  names: { p1: string; p2: string };
  onFire: (coord: string) => void;
}) {
  const t = useT();
  if (!state) {
    return <p className="font-mono text-xs text-muted-foreground">…</p>;
  }

  if (mode === 'model_vs_model' || humanSide === null) {
    // God view: both fleets (SPEC §7.4).
    const p1 = battleship.viewFor(state, 'p1');
    const p2 = battleship.viewFor(state, 'p2');
    return (
      <div className="flex flex-wrap justify-center gap-6">
        <BattleshipBoard size={state.size} variant="own" accent="p1" title={names.p1} cells={p1.ownBoard} />
        <BattleshipBoard size={state.size} variant="own" accent="p2" title={names.p2} cells={p2.ownBoard} />
      </div>
    );
  }

  const view = battleship.viewFor(state, humanSide);
  const legal = canFire ? battleship.legalMoves(state, toMove) : [];
  return (
    <div className="flex flex-wrap justify-center gap-6">
      <BattleshipBoard
        size={state.size}
        variant="own"
        accent={humanSide}
        title={t.battleship.yourFleet}
        cells={view.ownBoard}
      />
      <BattleshipBoard
        size={state.size}
        variant="tracking"
        accent={humanSide}
        title={t.battleship.yourShots}
        cells={view.trackingBoard}
        interactive={legal}
        onFire={onFire}
      />
    </div>
  );
}
