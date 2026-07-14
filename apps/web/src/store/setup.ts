import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { GameId } from '@arena/game-core';

import type { MatchMode } from '@/game/orchestrator';

/**
 * What the user picked on the setup screen, persisted to localStorage.
 *
 * The setup screen is unmounted while a match runs (the arena swaps it for the
 * game), so keeping this in component state meant every return to setup — "Zmień
 * ustawienia" — dropped the whole configuration back to defaults and forced the
 * user to re-pick the game, the mode and both models just to swap one model.
 *
 * Models are stored by id, not as objects: the catalog is refetched on every
 * mount, and a stale price/name snapshot would quietly diverge from it. An id
 * that is no longer in the catalog simply resolves to "nothing selected".
 */
export interface SetupPrefs {
  game: GameId;
  variantId: string;
  mode: MatchMode;
  p1ModelId: string | null;
  p2ModelId: string | null;
  reasoning: boolean;
  safetyOn: boolean;
  maxForfeits: number;
  maxTokens: number;
  commentatorOn: boolean;
  commentatorModelId: string | null;
  /**
   * `null` = the user never chose. The funded server coach is the friendlier
   * default, but only once we know the server offers one — so the choice stays
   * null until either the user or that discovery fills it in.
   */
  commentatorSource: 'byok' | 'server' | null;
  labOpen: boolean;
  appendix: string;
  temperature: number;
}

export const SETUP_DEFAULTS: SetupPrefs = {
  game: 'tictactoe',
  variantId: 'small',
  mode: 'human_vs_model',
  p1ModelId: null,
  p2ModelId: null,
  reasoning: false,
  safetyOn: true,
  maxForfeits: 4,
  maxTokens: 60_000,
  commentatorOn: false,
  commentatorModelId: null,
  commentatorSource: null,
  labOpen: false,
  appendix: '',
  temperature: 0.2,
};

interface SetupStore extends SetupPrefs {
  patch: (prefs: Partial<SetupPrefs>) => void;
}

export const useSetupPrefs = create<SetupStore>()(
  persist(
    (set) => ({
      ...SETUP_DEFAULTS,
      patch: (prefs) => set(prefs),
    }),
    {
      name: 'arena-setup',
      version: 1,
    },
  ),
);
