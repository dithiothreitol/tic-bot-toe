import { useCallback, useMemo, useState } from 'react';

import {
  type TicTacToeState,
  currentTurn,
  TICTACTOE_VARIANTS,
  ticTacToe,
} from '@arena/game-core';

import { Board3x3 } from '@/components/Board3x3';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { pl } from '@/i18n/pl';
import { cn } from '@/lib/utils';

const variant = TICTACTOE_VARIANTS[0];

function freshGame(): TicTacToeState {
  return ticTacToe.createInitialState(variant, {});
}

function PlayerChip({
  side,
  label,
  active,
}: {
  side: 'p1' | 'p2';
  label: string;
  active: boolean;
}) {
  const symbol = side === 'p1' ? 'X' : 'O';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm transition-all',
        side === 'p1' ? 'border-p1/30' : 'border-p2/30',
        active && (side === 'p1' ? 'glow-p1 bg-p1/5' : 'glow-p2 bg-p2/5'),
        !active && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'text-lg font-bold',
          side === 'p1' ? 'text-p1 text-glow-p1' : 'text-p2 text-glow-p2',
        )}
      >
        {symbol}
      </span>
      <span className="text-foreground/90">{label}</span>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<TicTacToeState>(freshGame);

  const status = ticTacToe.status(state);
  const turn = currentTurn(state);
  const legal = useMemo(
    () => (status === 'playing' ? ticTacToe.legalMoves(state, turn) : []),
    [state, status, turn],
  );
  const lastMove = state.moves.length > 0 ? state.moves[state.moves.length - 1] : null;

  const play = useCallback((cell: number) => {
    setState((s) => {
      if (ticTacToe.status(s) !== 'playing') return s;
      try {
        return ticTacToe.applyMove(s, currentTurn(s), cell);
      } catch {
        return s;
      }
    });
  }, []);

  const statusLine = (() => {
    switch (status) {
      case 'p1_won':
        return `${pl.status.wins}: ${pl.player.p1} (X)`;
      case 'p2_won':
        return `${pl.status.wins}: ${pl.player.p2} (O)`;
      case 'draw':
        return pl.status.draw;
      default:
        return `${pl.status.turn}: ${turn === 'p1' ? `${pl.player.p1} (X)` : `${pl.player.p2} (O)`}`;
    }
  })();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="font-mono text-3xl font-bold tracking-tight">
          <span className="text-p1 text-glow-p1">tic</span>
          <span className="text-muted-foreground">-bot-</span>
          <span className="text-p2 text-glow-p2">toe</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{pl.appTagline}</p>
      </header>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>{pl.games.tictactoe}</CardTitle>
          <CardDescription>{pl.mode.localHotseat}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-center gap-3">
            <PlayerChip
              side="p1"
              label={pl.player.p1}
              active={status === 'playing' && turn === 'p1'}
            />
            <PlayerChip
              side="p2"
              label={pl.player.p2}
              active={status === 'playing' && turn === 'p2'}
            />
          </div>

          <p
            aria-live="polite"
            className={cn(
              'text-center font-mono text-sm',
              status === 'p1_won' && 'text-p1',
              status === 'p2_won' && 'text-p2',
              status === 'draw' && 'text-muted-foreground',
            )}
          >
            {statusLine}
          </p>

          <Board3x3
            board={state.board}
            interactive={legal}
            onCellClick={play}
            lastMove={lastMove}
          />
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-3">
          <Button onClick={() => setState(freshGame())} className="w-full">
            {pl.actions.newGame}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{pl.stage1Note}</p>
        </CardFooter>
      </Card>
    </main>
  );
}
