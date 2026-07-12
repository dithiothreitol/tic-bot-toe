import { useEffect, useRef, useState } from 'react';

import {
  type GameStatus,
  type PlayerSide,
  type TicTacToeCell,
  type TicTacToeState,
  TICTACTOE_VARIANTS,
  ticTacToe,
} from '@arena/game-core';

import { Board3x3 } from '@/components/Board3x3';
import { GameLog } from '@/components/GameLog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  type MatchMode,
  type MatchOutcome,
  type MatchSnapshot,
  type MoveLogEntry,
  runMatch,
} from '@/game/orchestrator';
import { type PlayerSpec, makePlayer } from '@/game/players';
import { pl } from '@/i18n/pl';
import { formatCost } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { HumanPlayerHandle } from '@/providers/human';

const variant = TICTACTOE_VARIANTS[0];
const EMPTY_BOARD: TicTacToeCell[] = Array<TicTacToeCell>(9).fill(null);

export interface MatchConfig {
  mode: MatchMode;
  p1: PlayerSpec;
  p2: PlayerSpec;
  names: { p1: string; p2: string };
}

function humanSideOf(config: MatchConfig): PlayerSide | null {
  if (config.p1.kind === 'human') return 'p1';
  if (config.p2.kind === 'human') return 'p2';
  return null;
}

function PlayerChip({
  side,
  name,
  active,
}: {
  side: PlayerSide;
  name: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all',
        side === 'p1' ? 'border-p1/30' : 'border-p2/30',
        active ? (side === 'p1' ? 'glow-p1 bg-p1/5' : 'glow-p2 bg-p2/5') : 'opacity-60',
      )}
    >
      <span
        className={cn(
          'font-mono text-lg font-bold',
          side === 'p1' ? 'text-p1 text-glow-p1' : 'text-p2 text-glow-p2',
        )}
      >
        {side === 'p1' ? 'X' : 'O'}
      </span>
      <span className="max-w-40 truncate">{name}</span>
    </div>
  );
}

export function GameRunner({
  config,
  onExit,
}: {
  config: MatchConfig;
  onExit: () => void;
}) {
  const [board, setBoard] = useState<TicTacToeState | null>(null);
  const [log, setLog] = useState<MoveLogEntry[]>([]);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [toMove, setToMove] = useState<PlayerSide>('p1');
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const humansRef = useRef<Partial<Record<PlayerSide, HumanPlayerHandle>>>({});

  useEffect(() => {
    const abort = new AbortController();
    const humans: Partial<Record<PlayerSide, HumanPlayerHandle>> = {};
    const build = (spec: PlayerSpec, side: PlayerSide) => {
      const built = makePlayer(spec);
      if (built.human) humans[side] = built.human;
      return built.player;
    };
    const players = { p1: build(config.p1, 'p1'), p2: build(config.p2, 'p2') };
    humansRef.current = humans;

    setBoard(null);
    setLog([]);
    setStatus('playing');
    setToMove('p1');
    setOutcome(null);

    const applySnap = (snap: MatchSnapshot) => {
      setBoard(snap.state as TicTacToeState);
      setStatus(snap.status);
      setToMove(snap.toMove);
    };

    void runMatch({
      mode: config.mode,
      game: 'tictactoe',
      variant,
      players,
      signal: abort.signal,
      safetyMaxMoves: 9,
      onStart: applySnap,
      onMove: (entry, snap) => {
        setLog((l) => [...l, entry]);
        applySnap(snap);
      },
      onEnd: setOutcome,
    });

    return () => abort.abort();
  }, [config, restartKey]);

  const isHumanTurn =
    status === 'playing' && outcome === null && humansRef.current[toMove] !== undefined;
  const thinking =
    status === 'playing' && outcome === null && humansRef.current[toMove] === undefined;
  const interactive = isHumanTurn && board ? ticTacToe.legalMoves(board, toMove) : [];
  const lastMove =
    board && board.moves.length > 0 ? board.moves[board.moves.length - 1] : null;
  const activeName = toMove === 'p1' ? config.names.p1 : config.names.p2;

  const totalCost = log.reduce((sum, m) => sum + (m.telemetry.costUsd ?? 0), 0);
  const hasCost = log.some((m) => m.telemetry.costUsd !== undefined);

  const statusLine = (() => {
    if (outcome) {
      if (outcome.winner === null) return pl.status.aborted;
      if (outcome.winner === 'draw') return pl.status.draw;
      const hSide = humanSideOf(config);
      if (hSide) return outcome.winner === hSide ? pl.result.youWon : pl.result.youLost;
      const name = outcome.winner === 'p1' ? config.names.p1 : config.names.p2;
      return `${pl.status.wins}: ${name}`;
    }
    if (thinking) return `${activeName} ${pl.status.thinking}`;
    if (isHumanTurn) return pl.status.yourTurn;
    return `${pl.status.turn}: ${activeName}`;
  })();

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onExit}>
          ← {pl.result.backToSetup}
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {config.mode === 'model_vs_model'
            ? pl.mode.modelVsModel
            : pl.mode.humanVsModel}
        </span>
      </div>

      <Card>
        <CardContent className="grid gap-6 pt-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-3">
              <PlayerChip
                side="p1"
                name={config.names.p1}
                active={status === 'playing' && toMove === 'p1' && !outcome}
              />
              <PlayerChip
                side="p2"
                name={config.names.p2}
                active={status === 'playing' && toMove === 'p2' && !outcome}
              />
            </div>

            <p
              aria-live="polite"
              className={cn(
                'flex items-center gap-2 text-center font-mono text-sm',
                outcome?.winner === 'p1' && 'text-p1',
                outcome?.winner === 'p2' && 'text-p2',
              )}
            >
              {thinking && (
                <span
                  className={cn(
                    'inline-block size-2 animate-pulse rounded-full',
                    toMove === 'p1' ? 'bg-p1' : 'bg-p2',
                  )}
                />
              )}
              {statusLine}
            </p>

            <Board3x3
              board={board?.board ?? EMPTY_BOARD}
              interactive={interactive}
              onCellClick={(cell) => humansRef.current[toMove]?.submit(cell)}
              lastMove={lastMove}
            />

            {hasCost && (
              <p className="font-mono text-xs text-muted-foreground">
                {pl.result.cost}: {formatCost(totalCost)}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <GameLog moves={log} names={config.names} />
          </div>
        </CardContent>
      </Card>

      {outcome && (
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => setRestartKey((k) => k + 1)}>{pl.result.rematch}</Button>
          <Button variant="outline" onClick={onExit}>
            {pl.result.backToSetup}
          </Button>
        </div>
      )}
    </div>
  );
}
