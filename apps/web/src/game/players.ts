import type { Player } from '@arena/game-core';

import { type HumanPlayerHandle, createHumanPlayer } from '@/providers/human';
import type { TokenPrice } from '@/providers/llm-runner';
import { createOllamaPlayer } from '@/providers/ollama';
import { createOpenRouterPlayer } from '@/providers/openrouter';
import { createWebLlmPlayer } from '@/providers/webllm';

export type PlayerSpec =
  | { kind: 'human'; displayName?: string }
  | {
      kind: 'openrouter';
      model: string;
      displayName: string;
      apiKey: string;
      price?: TokenPrice;
      temperature?: number;
      systemAppendix?: string;
    }
  | {
      kind: 'webllm';
      model: string;
      displayName: string;
      temperature?: number;
      systemAppendix?: string;
    }
  | {
      kind: 'ollama';
      model: string;
      displayName: string;
      temperature?: number;
      systemAppendix?: string;
    };

export interface BuiltPlayer {
  player: Player;
  /** Present only for human players — the UI submits moves through it. */
  human?: HumanPlayerHandle;
}

export function makePlayer(spec: PlayerSpec): BuiltPlayer {
  switch (spec.kind) {
    case 'human': {
      const handle = createHumanPlayer('human', spec.displayName ?? 'Człowiek');
      return { player: handle.player, human: handle };
    }
    case 'webllm':
      return {
        player: createWebLlmPlayer(spec.model, spec.displayName, {
          temperature: spec.temperature,
          systemAppendix: spec.systemAppendix,
        }),
      };
    case 'ollama':
      return {
        player: createOllamaPlayer(spec.model, spec.displayName, {
          temperature: spec.temperature,
          systemAppendix: spec.systemAppendix,
        }),
      };
    case 'openrouter':
      return {
        player: createOpenRouterPlayer(
          {
            model: spec.model,
            apiKey: spec.apiKey,
            price: spec.price,
            temperature: spec.temperature,
            systemAppendix: spec.systemAppendix,
          },
          spec.displayName,
        ),
      };
  }
}
