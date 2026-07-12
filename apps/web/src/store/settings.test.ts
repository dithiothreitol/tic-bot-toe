import { getOpenRouterKey, useSettings } from './settings';

beforeEach(() => {
  localStorage.clear();
  useSettings.setState({ openRouterKey: null, soundEnabled: false, nickname: null });
});

describe('useSettings', () => {
  it('stores a trimmed OpenRouter key and exposes it via getOpenRouterKey', () => {
    useSettings.getState().setOpenRouterKey('  sk-or-abc  ');
    expect(useSettings.getState().openRouterKey).toBe('sk-or-abc');
    expect(getOpenRouterKey()).toBe('sk-or-abc');
  });

  it('treats an empty/whitespace key as null', () => {
    useSettings.getState().setOpenRouterKey('   ');
    expect(useSettings.getState().openRouterKey).toBeNull();
  });

  it('clears the key', () => {
    useSettings.getState().setOpenRouterKey('sk-or-abc');
    useSettings.getState().clearOpenRouterKey();
    expect(useSettings.getState().openRouterKey).toBeNull();
  });

  it('persists the key ONLY to localStorage (never elsewhere)', () => {
    useSettings.getState().setOpenRouterKey('sk-or-xyz');
    const raw = localStorage.getItem('arena-settings');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).state.openRouterKey).toBe('sk-or-xyz');
  });

  it('has a stable UUID playerToken', () => {
    const token = useSettings.getState().playerToken;
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(useSettings.getState().playerToken).toBe(token);
  });

  it('trims the nickname and empties it to null', () => {
    useSettings.getState().setNickname('  Ala  ');
    expect(useSettings.getState().nickname).toBe('Ala');
    useSettings.getState().setNickname('   ');
    expect(useSettings.getState().nickname).toBeNull();
  });
});
