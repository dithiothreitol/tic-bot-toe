import { render, screen } from '@testing-library/react';

import type { PsychologyPayload } from '@/api/client';
import { pl } from '@/i18n';

import { BehaviorHeatmap, PsychologySection } from './BehaviorHeatmap';

function ttt(n: number): Extract<PsychologyPayload, { game: 'tictactoe' }> {
  return {
    game: 'tictactoe',
    n,
    firstMoveCounts: [0, 0, 0, 0, n, 0, 0, 0, 0], // all opens on the center
    firstMoveWins: [0, 0, 0, 0, Math.floor(n / 2), 0, 0, 0, 0],
    moveCounts: [1, 0, 0, 0, n, 0, 0, 0, 1],
  };
}

describe('BehaviorHeatmap (Module C)', () => {
  it('renders one cell per value with an accessible label', () => {
    render(<BehaviorHeatmap values={[0, 1, 2, 3]} cols={2} ariaLabel="shots" />);
    const grid = screen.getByRole('img', { name: 'shots' });
    expect(grid.children).toHaveLength(4);
  });

  it('overlays the count when showValues is set', () => {
    render(<BehaviorHeatmap values={[0, 5]} cols={2} showValues ariaLabel="moves" />);
    expect(screen.getByText('5')).toBeInTheDocument();
    // A zero cell shows no number (only non-empty cells are annotated).
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('PsychologySection (Module C)', () => {
  it('shows the empty state below the sample floor', () => {
    render(<PsychologySection t={pl} payload={ttt(4)} n={4} />);
    expect(screen.getByText(pl.modelCard.psychologyEmpty)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: pl.modelCard.psychFirstMove })).not.toBeInTheDocument();
  });

  it('shows the empty state when there is no payload at all', () => {
    render(<PsychologySection t={pl} payload={null} n={0} />);
    expect(screen.getByText(pl.modelCard.psychologyEmpty)).toBeInTheDocument();
  });

  it('renders both tic-tac-toe grids and the sample size once the floor is met', () => {
    render(<PsychologySection t={pl} payload={ttt(12)} n={12} />);
    expect(screen.getByRole('img', { name: pl.modelCard.psychFirstMove })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: pl.modelCard.psychAllMoves })).toBeInTheDocument();
    expect(screen.getByText(pl.modelCard.psychologySample(12))).toBeInTheDocument();
  });

  it('renders the battleship shot grids sized to the board', () => {
    const payload: PsychologyPayload = {
      game: 'battleship',
      n: 15,
      size: 6,
      shotCounts: Array.from({ length: 36 }, (_, i) => (i === 0 ? 15 : 0)),
      firstShotCounts: Array.from({ length: 36 }, (_, i) => (i === 0 ? 15 : 0)),
    };
    render(<PsychologySection t={pl} payload={payload} n={15} />);
    const shots = screen.getByRole('img', { name: pl.modelCard.psychAllShots });
    expect(shots.children).toHaveLength(36);
  });
});
