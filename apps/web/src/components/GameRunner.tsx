import { useEffect, useRef, useState } from 'react';

import {
  type BattleshipState,
  type GameId,
  type GameStatus,
  type Move,
  type PlayerSide,
  type SetupConfig,
  type TicTacToeCell,
  type TicTacToeState,
  type Variant,
  battleship,
  getBattleshipVariant,
  ticTacToe,
} from '@arena/game-core';

import { Board3x3 } from '@/components/Board3x3';
import { BattleshipBoard } from '@/components/BattleshipBoard';
import { TimelineChart } from '@/components/charts/TimelineChart';
import { GameLog } from '@/components/GameLog';
import { ShipPlacement } from '@/components/ShipPlacement';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HudPanel } from '@/components/ui/hud';
import {
  type MatchMode,
  type MatchOutcome,
  type MatchSnapshot,
  type MoveLogEntry,
  runMatch,
} from '@/game/orchestrator';
import { type PlayerSpec, makePlayer } from '@/game/players';
import { toast } from 'sonner';

import type { SaveResultResponse } from '@/api/client';
import { saveResult } from '@/api/results';
import { pl } from '@/i18n/pl';
import { formatCost } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { HumanPlayerHandle } from '@/providers/human';

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

const EMPTY_TTT: TicTacToeCell[] = Array<TicTacToeCell>(9).fill(null);

export interface MatchConfig {
  game: GameId;
  variant: Variant;
  mode: MatchMode;
  p1: PlayerSpec;
  p2: PlayerSpec;
  names: { p1: string; p2: string };
  seed: number;
  extraShotOnHit?: boolean;
}

function humanSideOf(config: MatchConfig): PlayerSide | null {
  if (config.p1.kind === 'human') return 'p1';
  if (config.p2.kind === 'human') return 'p2';
  return null;
}

export function GameRunner({
  config,
  onExit,
}: {
  config: MatchConfig;
  onExit: () => void;
}) {
  const [state, setState] = useState<unknown>(null);
  const [log, setLog] = useState<MoveLogEntry[]>([]);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [toMove, setToMove] = useState<PlayerSide>('p1');
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [placement, setPlacement] = useState<number[][] | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveResponse, setSaveResponse] = useState<SaveResultResponse | null>(null);
  const humansRef = useRef<Partial<Record<PlayerSide, HumanPlayerHandle>>>({});

  const humanSide = humanSideOf(config);
  const needsPlacement =
    config.game === 'battleship' && humanSide !== null && placement === null;

  useEffect(() => {
    if (needsPlacement) return;

    const abort = new AbortController();
    const humans: Partial<Record<PlayerSide, HumanPlayerHandle>> = {};
    const build = (spec: PlayerSpec, side: PlayerSide) => {
      const built = makePlayer(spec);
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

    void runMatch({
      mode: config.mode,
      game: config.game,
      variant: config.variant,
      config: setupConfig,
      players,
      signal: abort.signal,
      safetyMaxMoves: config.game === 'battleship' ? 2 * size * size : 9,
      onStart: applySnap,
      onMove: (entry, snap) => {
        setLog((l) => [...l, entry]);
        applySnap(snap);
      },
      onEnd: setOutcome,
    });

    return () => abort.abort();
  }, [config, restartKey, placement, needsPlacement, humanSide]);

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
    setRestartKey((k) => k + 1);
  };

  const savable = outcome !== null && !outcome.aborted && outcome.winner !== null;

  const handleSave = async () => {
    if (!outcome) return;
    setSaveState('saving');
    try {
      const resp = await saveResult(outcome, priceSnapshotFor(config));
      setSaveResponse(resp);
      setSaveState('saved');
    } catch (e) {
      setSaveState('idle');
      if ((e as Error).message !== 'anulowano') toast.error(pl.result.saveError);
    }
  };

  const statusLine = (() => {
    if (outcome) {
      if (outcome.winner === null) return pl.status.aborted;
      if (outcome.winner === 'draw') return pl.status.draw;
      if (humanSide) return outcome.winner === humanSide ? pl.result.youWon : pl.result.youLost;
      const name = outcome.winner === 'p1' ? config.names.p1 : config.names.p2;
      return `${pl.status.wins}: ${name}`;
    }
    if (thinking) return `${activeName} ${pl.status.thinking}`;
    if (isHumanTurn) return pl.status.yourTurn;
    return `${pl.status.turn}: ${activeName}`;
  })();

  const header = (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={onExit}>
        ← {pl.result.backToSetup}
      </Button>
      <span className="section-label">
        {pl.games[config.game]} ·{' '}
        {config.mode === 'model_vs_model' ? pl.mode.modelVsModel : pl.mode.humanVsModel}
      </span>
    </div>
  );

  const slotSymbol = (side: PlayerSide): string =>
    config.game === 'tictactoe' ? (side === 'p1' ? 'X' : 'O') : '⚓';
  const activeSide = (side: PlayerSide): boolean =>
    outcome ? outcome.winner === side : status === 'playing' && toMove === side;

  const playerSlots = (
    <div className="grid grid-cols-2 gap-3">
      {(['p1', 'p2'] as const).map((side) => (
        <PlayerSlot
          key={side}
          side={side}
          name={side === 'p1' ? config.names.p1 : config.names.p2}
          symbol={slotSymbol(side)}
          active={activeSide(side)}
        />
      ))}
    </div>
  );

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
              {pl.result.cost}: {formatCost(totalCost)}
            </p>
          )}
        </HudPanel>

        <HudPanel className="min-w-0 p-4">
          <GameLog moves={log} names={config.names} />
        </HudPanel>
      </div>

      <TimelineChart log={log} live={live} />

      {outcome && (
        <div className="flex flex-col items-center gap-3">
          {savable && saveState !== 'saved' && (
            <Button onClick={handleSave} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? pl.result.saving : pl.result.save}
            </Button>
          )}
          {saveResponse && saveResponse.ratingChanges.length > 0 && (
            <div className="flex flex-col items-center gap-1 font-mono text-xs">
              <span className="text-edu text-glow-edu uppercase tracking-wide">
                {pl.result.saved}
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
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={rematch}>{pl.result.rematch}</Button>
            <Button variant="outline" onClick={onExit}>
              {pl.result.backToSetup}
            </Button>
          </div>
        </div>
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
  symbol,
  active,
}: {
  side: PlayerSide;
  name: string;
  symbol: string;
  active: boolean;
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
      <span
        aria-hidden
        className={cn(
          'clip-cut flex size-9 shrink-0 items-center justify-center bg-gradient-to-br font-mono text-lg font-bold',
          isP1 ? 'from-p1/80 to-p1/20 text-p1-foreground' : 'from-p2/80 to-p2/20 text-p2-foreground',
        )}
      >
        {symbol}
      </span>
      <div className="min-w-0">
        <div className="truncate font-sans font-bold tracking-wide">{name}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {isP1 ? 'Player_01' : 'Player_02'} · {symbol}
        </div>
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
        title={pl.battleship.yourFleet}
        cells={view.ownBoard}
      />
      <BattleshipBoard
        size={state.size}
        variant="tracking"
        accent={humanSide}
        title={pl.battleship.yourShots}
        cells={view.trackingBoard}
        interactive={legal}
        onFire={onFire}
      />
    </div>
  );
}
