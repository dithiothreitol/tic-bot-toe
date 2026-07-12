import type { Player } from '@arena/game-core';

import { type HumanPlayerHandle, createHumanPlayer } from '@/providers/human';
import type { TokenPrice } from '@/providers/llm-runner';
import { createOpenRouterPlayer } from '@/providers/openrouter';

export type PlayerSpec =
  | { kind: 'human'; displayName?: string }
  | {
      kind: 'openrouter';
      model: string;
      displayName: string;
      apiKey: string;
      price?: TokenPrice;
      temperature?: number;
    };

export interface BuiltPlayer {
  player: Player;
  /** Present only for human players — the UI submits moves through it. */
  human?: HumanPlayerHandle;
}

export function makePlayer(spec: PlayerSpec): BuiltPlayer {
  if (spec.kind === 'human') {
    const handle = createHumanPlayer('human', spec.displayName ?? 'Człowiek');
    return { player: handle.player, human: handle };
  }
  const player = createOpenRouterPlayer(
    {
      model: spec.model,
      apiKey: spec.apiKey,
      price: spec.price,
      temperature: spec.temperature,
    },
    spec.displayName,
  );
  return { player };
}
