import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { randomToken } from '@/lib/id';

/**
 * Client settings, persisted to localStorage (SPEC §16).
 *
 * HARD CONSTRAINT: the OpenRouter key lives ONLY here (localStorage) and is
 * sent ONLY to openrouter.ai by the provider transport. It NEVER reaches our
 * backend — nothing in this app posts `openRouterKey` anywhere else.
 * `playerToken` is a random UUID with no personal data (§16).
 */
export interface SettingsState {
  openRouterKey: string | null;
  soundEnabled: boolean;
  nickname: string | null;
  playerToken: string;

  setOpenRouterKey: (key: string | null) => void;
  clearOpenRouterKey: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setNickname: (nickname: string | null) => void;
}

function clean(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      openRouterKey: null,
      soundEnabled: false,
      nickname: null,
      playerToken: randomToken(),

      setOpenRouterKey: (key) => set({ openRouterKey: clean(key) }),
      clearOpenRouterKey: () => set({ openRouterKey: null }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setNickname: (nickname) => set({ nickname: clean(nickname) }),
    }),
    {
      name: 'arena-settings',
      version: 1,
    },
  ),
);

/** Non-reactive read of the key for provider transports. */
export function getOpenRouterKey(): string | null {
  return useSettings.getState().openRouterKey;
}
