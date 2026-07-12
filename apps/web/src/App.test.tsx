import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import App from './App';

// No network in tests: the catalog resolves empty.
vi.mock('@/providers/openrouter-catalog', () => ({
  fetchCatalog: () => Promise.resolve([]),
}));

const renderApp = () => render(<MemoryRouter><App /></MemoryRouter>);

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('renders the setup screen with both game modes', async () => {
    renderApp();
    expect(await screen.findByText('Nowa partia')).toBeInTheDocument();
    expect(screen.getByText('Człowiek kontra model')).toBeInTheDocument();
    expect(screen.getByText('Model kontra model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('switches to battleship and reveals the variant selector', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('tab', { name: 'Statki' }));
    expect(await screen.findByText('Wariant')).toBeInTheDocument();
  });

  it('opens settings and surfaces the local-only key notice', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByLabelText('Ustawienia'));
    // Scope to the dialog: the arena footer also mentions openrouter.ai, and this
    // test is about the notice INSIDE settings (§16).
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/wyłącznie do openrouter\.ai/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Klucz OpenRouter')).toBeInTheDocument();
  });
});
