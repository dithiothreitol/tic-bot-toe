import { render, screen, waitFor } from '@testing-library/react';

import { getGame } from '@arena/game-core';

import type { MatchConfig } from '@/components/GameRunner';
import { pl } from '@/i18n/pl';

import { SeriesRunner } from './SeriesRunner';

// Drive the component with a scripted series: A wins, B wins, draw (best of 3).
vi.mock('@/game/series', () => ({
  emptyAggregate: () => ({
    games: 0, aWins: 0, bWins: 0, draws: 0, tokensA: 0, tokensB: 0, costA: 0, costB: 0, forfeitA: 0, forfeitB: 0,
  }),
  runSeries: (opts: {
    onGameEnd?: (r: unknown, agg: unknown) => void;
  }) => {
    const outcome = { moves: [] };
    const script = [
      { index: 0, aSide: 'p1', winner: 'p1', promptWinner: 'A', outcome },
      { index: 1, aSide: 'p2', winner: 'p1', promptWinner: 'B', outcome },
      { index: 2, aSide: 'p1', winner: 'draw', promptWinner: 'draw', outcome },
    ];
    const agg = { games: 0, aWins: 0, bWins: 0, draws: 0, tokensA: 0, tokensB: 0, costA: 0, costB: 0, forfeitA: 0, forfeitB: 0 };
    for (const g of script) {
      agg.games += 1;
      if (g.promptWinner === 'A') agg.aWins += 1;
      else if (g.promptWinner === 'B') agg.bWins += 1;
      else agg.draws += 1;
      opts.onGameEnd?.(g, { ...agg });
    }
    return Promise.resolve(agg);
  },
}));

function duelConfig(): MatchConfig {
  return {
    game: 'tictactoe',
    variant: getGame('tictactoe').variants[0]!,
    mode: 'model_vs_model',
    p1: { kind: 'webllm', model: 'm', displayName: 'TinyModel' },
    p2: { kind: 'webllm', model: 'm', displayName: 'TinyModel' },
    names: { p1: 'TinyModel', p2: 'TinyModel' },
    seed: 1,
    lab: true,
    series: { appendixA: 'A', appendixB: 'B', seriesLength: 3, seriesSeed: 100 },
  };
}

describe('SeriesRunner (Module F) — scoreboard + result card', () => {
  it('renders per-game tiles, the running score and a final result card', async () => {
    render(<SeriesRunner config={duelConfig()} onExit={() => {}} />);

    // The final result card appears once the (mocked) series resolves.
    expect(await screen.findByText(pl.lab.duel.resultKicker)).toBeInTheDocument();
    // A won 1, B won 1, 1 draw → a tie in the series.
    expect(screen.getByText(pl.lab.duel.resultTie)).toBeInTheDocument();
    expect(screen.getByText(pl.lab.duel.resultLine('TinyModel', 3, 1, 1, 1))).toBeInTheDocument();

    // Three game tiles rendered (one shows '=' for the draw).
    await waitFor(() => expect(screen.getAllByText('=').length).toBeGreaterThanOrEqual(1));
    // "Again" and "Back" controls once done.
    expect(screen.getByRole('button', { name: pl.lab.duel.again })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: pl.lab.duel.back })).toBeInTheDocument();
  });
});
