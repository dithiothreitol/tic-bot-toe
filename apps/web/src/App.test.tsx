import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import App from './App';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { useSettings } from '@/store/settings';

// No network in tests: the catalog resolves empty.
vi.mock('@/providers/openrouter-catalog', () => ({
  fetchCatalog: () => Promise.resolve([]),
}));

const renderApp = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  // jsdom reports an English browser, and an unprefixed path follows the browser
  // (§ LocaleGate). These tests are about the Polish UI, so they pin the language
  // the way a returning user does: by having chosen it once.
  useSettings.setState({ localePref: 'pl' });
});

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

  it('explains why the key is needed and where to get it — in settings and in the quick start', async () => {
    const user = userEvent.setup();
    renderApp();

    // Quick-start strip: a first-time player reads it before ever opening settings.
    expect(await screen.findByText(pl.keyHelp.title)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(pl.keyHelp.cta, 'i') }),
    ).toHaveAttribute('href', 'https://openrouter.ai/keys');

    await user.click(screen.getByLabelText('Ustawienia'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(pl.keyHelp.title)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: new RegExp(pl.keyHelp.cta, 'i') }),
    ).toHaveAttribute('href', 'https://openrouter.ai/keys');
  });
});

describe('language', () => {
  it('serves English under /en, with English nav pointing at English URLs', async () => {
    renderApp('/en');
    expect(await screen.findByText(en.arena.heading)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.nav.rankings })).toHaveAttribute(
      'href',
      '/en/rankings',
    );
    expect(document.documentElement.lang).toBe('en');
  });

  it('sends a first-time visitor with a non-Polish browser to /en', async () => {
    useSettings.setState({ localePref: null }); // never chose → the browser decides
    renderApp('/');
    expect(await screen.findByText(en.arena.heading)).toBeInTheDocument();
  });

  it('keeps a visitor who chose Polish on the Polish URLs', async () => {
    renderApp('/');
    expect(await screen.findByText(pl.arena.heading)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('pl');
  });

  it('switches to the SAME page in the other language, and remembers the choice', async () => {
    const user = userEvent.setup();
    renderApp('/rankingi');

    const toEnglish = screen.getByRole('link', { name: 'en' });
    expect(toEnglish).toHaveAttribute('href', '/en/rankings');

    await user.click(toEnglish);
    // We are on the English rankings page, and ITS links are English too — proof
    // the whole tree switched, not just the header.
    expect(
      await screen.findByRole('link', { name: `${en.nav.compare} →` }),
    ).toHaveAttribute('href', '/en/compare');
    expect(useSettings.getState().localePref).toBe('en');
  });
});
