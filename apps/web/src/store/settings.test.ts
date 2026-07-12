import { isValidPlayerToken } from '@/lib/id';

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

  it('has a stable playerToken the API will accept', () => {
    const token = useSettings.getState().playerToken;
    // 256-bit base64url bearer secret (§10/§16) — the server only ever sees its hash.
    expect(isValidPlayerToken(token)).toBe(true);
    expect(useSettings.getState().playerToken).toBe(token);
  });

  it('trims the nickname and empties it to null', () => {
    useSettings.getState().setNickname('  Ala  ');
    expect(useSettings.getState().nickname).toBe('Ala');
    useSettings.getState().setNickname('   ');
    expect(useSettings.getState().nickname).toBeNull();
  });

  it('adopts an imported identity and drops the old nickname mirror', () => {
    useSettings.getState().setNickname('Ala');
    const imported = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
    useSettings.getState().setPlayerToken(imported);
    expect(useSettings.getState().playerToken).toBe(imported);
    // The nickname belongs to the *previous* identity — it must not leak over.
    expect(useSettings.getState().nickname).toBeNull();
  });
});
