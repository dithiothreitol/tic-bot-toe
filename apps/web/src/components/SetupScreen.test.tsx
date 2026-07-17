import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SetupScreen } from './SetupScreen';
import { pl } from '@/i18n/pl';
import { SETUP_DEFAULTS, useSetupPrefs } from '@/store/setup';

vi.mock('@/providers/openrouter-catalog', () => ({
  fetchCatalog: () =>
    Promise.resolve([
      {
        id: 'vendor/one',
        name: 'Model One',
        contextLength: 8192,
        pricePromptPerToken: 0,
        priceCompletionPerToken: 0,
        isFree: true,
        isReasoning: false,
      },
    ]),
}));

// No server in tests: no Ollama, no funded coach.
vi.mock('@/api/client', () => ({
  apiGet: () => Promise.reject(new Error('offline')),
}));

const renderSetup = () =>
  render(<SetupScreen onStart={() => {}} onOpenSettings={() => {}} />);

beforeEach(() => {
  localStorage.clear();
  useSetupPrefs.setState(SETUP_DEFAULTS);
});

describe('SetupScreen', () => {
  // The arena unmounts this screen for the duration of a match, so "back to
  // setup" used to hand the player a blank form — game, mode and both models
  // all had to be re-picked to swap a single model.
  it('keeps the configuration across a remount (back from a match)', async () => {
    const user = userEvent.setup();
    const first = renderSetup();

    await user.click(await screen.findByRole('tab', { name: pl.games.battleship }));
    await user.click(screen.getByRole('tab', { name: pl.mode.modelVsModel }));
    expect(await screen.findByText(pl.setup.variant)).toBeInTheDocument();

    first.unmount();
    renderSetup();

    expect(screen.getByRole('tab', { name: pl.games.battleship })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: pl.mode.modelVsModel })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Model-vs-model shows a picker for P1 instead of the human placeholder.
    expect(screen.getByText(pl.setup.modelP1)).toBeInTheDocument();
    expect(screen.getByText(pl.setup.variant)).toBeInTheDocument();
  });

  it('offers Sudoku Duel with its variant selector', async () => {
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('tab', { name: pl.games.sudoku }));
    // The variant selector appears (sudoku has three board sizes).
    expect(await screen.findByText(pl.setup.variant)).toBeInTheDocument();
    // Default sudoku variant is the mini board.
    expect(screen.getByText(pl.variants.mini)).toBeInTheDocument();
  });

  it('offers Word Battle with a language (pl/en) selector', async () => {
    const user = userEvent.setup();
    renderSetup();

    await user.click(await screen.findByRole('tab', { name: pl.games.scrabble }));
    expect(await screen.findByText(pl.setup.variant)).toBeInTheDocument();
    expect(screen.getByText(pl.variants.pl)).toBeInTheDocument(); // "Polski"
  });

  it('restores a remembered model once the catalog loads', async () => {
    useSetupPrefs.setState({ p2ModelId: 'vendor/one' });
    renderSetup();
    expect(await screen.findByText('Model One')).toBeInTheDocument();
  });

  it('shows no selection for a remembered model that left the catalog', async () => {
    useSetupPrefs.setState({ p2ModelId: 'vendor/gone' });
    renderSetup();
    // The picker falls back to its placeholder rather than a dangling id.
    expect(await screen.findAllByText(pl.setup.chooseModel)).not.toHaveLength(0);
    expect(screen.queryByText('vendor/gone')).not.toBeInTheDocument();
  });
});
