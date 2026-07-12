import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from './App';

// No network in tests: the catalog resolves empty.
vi.mock('@/providers/openrouter-catalog', () => ({
  fetchCatalog: () => Promise.resolve([]),
}));

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('renders the setup screen with both game modes', async () => {
    render(<App />);
    expect(await screen.findByText('Nowa partia')).toBeInTheDocument();
    expect(screen.getByText('Człowiek kontra model')).toBeInTheDocument();
    expect(screen.getByText('Model kontra model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('opens settings and surfaces the local-only key notice', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByLabelText('Ustawienia'));
    expect(await screen.findByText(/wyłącznie do openrouter\.ai/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Klucz OpenRouter')).toBeInTheDocument();
  });
});
