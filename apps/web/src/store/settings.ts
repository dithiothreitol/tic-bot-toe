import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Locale } from '@/i18n';
import { randomSecret } from '@/lib/id';

/**
 * Client settings, persisted to localStorage (SPEC §16).
 *
 * HARD CONSTRAINT: the OpenRouter key lives ONLY here (localStorage) and is
 * sent ONLY to openrouter.ai by the provider transport. It NEVER reaches our
 * backend — nothing in this app posts `openRouterKey` anywhere else.
 *
 * `playerToken` is the pseudonymous identity (§10/§16): a random secret with no
 * personal data. It is what makes every match by this person accumulate into a
 * single ranking row, so it must stay stable — and it is portable, which is the
 * only way to keep one identity across browsers (`setPlayerToken`).
 * `nickname` mirrors the server value for display; the server is authoritative.
 */
export interface SettingsState {
  openRouterKey: string | null;
  soundEnabled: boolean;
  nickname: string | null;
  playerToken: string;
  /**
   * The language the user PICKED, not the one they are currently reading — that
   * one lives in the URL (`/en/...`). Only set by the language switcher, and
   * only used to decide whether a first-time visitor landing on an unprefixed
   * path should be sent to their browser's language. `null` = never chose.
   */
  localePref: Locale | null;

  setOpenRouterKey: (key: string | null) => void;
  clearOpenRouterKey: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setNickname: (nickname: string | null) => void;
  /** Adopt an identity exported from another browser (§10). */
  setPlayerToken: (token: string) => void;
  setLocalePref: (locale: Locale) => void;
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
      playerToken: randomSecret(),
      localePref: null,

      setOpenRouterKey: (key) => set({ openRouterKey: clean(key) }),
      clearOpenRouterKey: () => set({ openRouterKey: null }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setNickname: (nickname) => set({ nickname: clean(nickname) }),
      // Switching identity drops the local nickname mirror; it is re-read from
      // the server for the adopted token.
      setPlayerToken: (playerToken) => set({ playerToken, nickname: null }),
      setLocalePref: (localePref) => set({ localePref }),
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

/** Non-reactive read of the identity token for our own API calls. */
export function getPlayerToken(): string {
  return useSettings.getState().playerToken;
}
