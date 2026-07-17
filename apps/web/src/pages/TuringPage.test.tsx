import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import App from '@/App';
import { pl } from '@/i18n/pl';
import { useSettings } from '@/store/settings';

// The catalog never loads in tests (App mounts the arena shell).
vi.mock('@/providers/openrouter-catalog', () => ({
  fetchCatalog: () => Promise.resolve([]),
}));

// Deterministic Turing API: one tic-tac-toe puzzle, a correct reveal, empty board.
const submitTuringGuess = vi.fn(() =>
  Promise.resolve({ correct: true, humanSide: 'p1', modelId: 'openrouter:bot', matchId: 'm1' }),
);
vi.mock('@/api/turing', () => ({
  fetchTuringNext: () =>
    Promise.resolve({
      puzzle: {
        game: 'tictactoe',
        variant: 'standard',
        setup: null,
        moves: [
          { player: 'p1', move: 4 },
          { player: 'p2', move: 0 },
          { player: 'p1', move: 8 },
        ],
      },
      puzzleToken: 'tok',
    }),
  submitTuringGuess: () => submitTuringGuess(),
  fetchTuringLeaderboard: () => Promise.resolve([]),
}));

beforeEach(() => {
  localStorage.clear();
  useSettings.setState({ localePref: 'pl' });
  submitTuringGuess.mockClear();
});

describe('TuringPage (Module D) — reveal flow', () => {
  it('loads a puzzle, scores a guess and reveals the outcome + next button', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/turing']}>
        <App />
      </MemoryRouter>,
    );

    // The puzzle loads → the question and both guess buttons appear.
    expect(await screen.findByText(pl.turing.title)).toBeInTheDocument();
    const guessA = await screen.findByRole('button', {
      name: pl.turing.guessHuman(pl.turing.playerA),
    });
    expect(
      screen.getByRole('button', { name: pl.turing.guessHuman(pl.turing.playerB) }),
    ).toBeInTheDocument();

    // Guessing scores server-side (mocked correct) → reveal + „next" button.
    await user.click(guessA);
    expect(await screen.findByText(pl.turing.correct)).toBeInTheDocument();
    expect(screen.getByText(pl.turing.revealModel('openrouter:bot'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: pl.turing.next })).toBeInTheDocument();
    expect(submitTuringGuess).toHaveBeenCalledTimes(1);
    // A correct guess bumps the streak counter.
    expect(screen.getByText(pl.turing.streak(1))).toBeInTheDocument();
  });
});
