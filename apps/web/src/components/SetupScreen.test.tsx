import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SetupScreen } from './SetupScreen';
import { pl } from '@/i18n/pl';
import { useSettings } from '@/store/settings';
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
  useSettings.setState({ openRouterKey: null });
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

  it('reveals the prompt-duel controls when lab + duel are toggled on (Module F)', async () => {
    const user = userEvent.setup();
    renderSetup();

    // The single appendix and duel controls are hidden until the lab is open.
    expect(screen.queryByText(pl.lab.duel.promptA)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('switch', { name: pl.lab.toggle }));
    expect(screen.getByText(pl.lab.appendix)).toBeInTheDocument(); // single appendix visible

    await user.click(screen.getByRole('switch', { name: pl.lab.duel.toggle }));
    // Two prompt fields + the game-count buttons appear; the single appendix hides.
    expect(screen.getByText(pl.lab.duel.promptA)).toBeInTheDocument();
    expect(screen.getByText(pl.lab.duel.promptB)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
    expect(screen.queryByText(pl.lab.appendix)).not.toBeInTheDocument();
    // Enabling the duel from the DEFAULT human mode switches to model-vs-model,
    // so it can't silently no-op (review finding #1).
    expect(useSetupPrefs.getState().mode).toBe('model_vs_model');
  });

  it('starts a prompt duel (config.series) even though the default mode was human (Module F)', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    // Model One is an OpenRouter model → a key is required to start.
    useSettings.setState({ openRouterKey: 'sk-or-test' });
    useSetupPrefs.setState({ p1ModelId: 'vendor/one', p2ModelId: 'vendor/one' });
    render(<SetupScreen onStart={onStart} onOpenSettings={() => {}} />);
    // Model One (from the catalog mock) must be loaded before we can start.
    await screen.findAllByText('Model One');

    await user.click(screen.getByRole('switch', { name: pl.lab.toggle }));
    await user.click(screen.getByRole('switch', { name: pl.lab.duel.toggle }));
    await user.click(screen.getByRole('button', { name: pl.setup.start }));

    expect(onStart).toHaveBeenCalledTimes(1);
    const config = onStart.mock.calls[0]![0];
    expect(config.mode).toBe('model_vs_model');
    expect(config.series).toMatchObject({ seriesLength: 5 });
    expect(config.lab).toBe(true);
  });
});
