import type { Move, MoveResult, Player, PlayerView } from '@arena/game-core';

import {
  type ChatTransport,
  type LlmMoveConfig,
  type TokenPrice,
  moveMaxTokens,
  runLlmMove,
} from './llm-runner';

/**
 * OpenRouter BYOK provider (SPEC §2.1). The key comes from localStorage and is
 * sent ONLY to this host — never to our backend, never anywhere else.
 */
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export interface OpenRouterConfig {
  model: string;
  /** User's key, read from localStorage. Sent only to openrouter.ai. */
  apiKey: string;
  price?: TokenPrice;
  temperature?: number; // SPEC §8 default 0.2 (lab: 0–1.5 slider, §12.4)
  maxTokens?: number; // SPEC §8: 50–60 (reasoning mode raises the default)
  /** Prompt-lab appendix (§12.4), appended after the core system prompt. */
  systemAppendix?: string;
  /** Let the model reason before answering; also lifts the default max_tokens. */
  reasoning?: boolean;
  /** HTTP-Referer / X-Title for OpenRouter attribution. */
  referer?: string;
  title?: string;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Runner knobs (tests / lab temperature is separate). */
  runner?: Pick<
    LlmMoveConfig,
    'maxRetries' | 'timeoutMs' | 'rng' | 'now' | 'retryDelayMs' | 'rateLimitDelayMs' | 'sleep'
  >;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function defaultReferer(): string {
  return typeof location !== 'undefined' && location.origin
    ? location.origin
    : 'https://tic-bot-toe.local';
}

export function createOpenRouterTransport(config: OpenRouterConfig): ChatTransport {
  const doFetch = config.fetchImpl ?? fetch;
  return async (messages, signal) => {
    const res = await doFetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': config.referer ?? defaultReferer(),
        'X-Title': config.title ?? 'tic-bot-toe',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature ?? 0.2,
        max_tokens: config.maxTokens ?? moveMaxTokens(config.reasoning),
      }),
      signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  };
}

/** Validate a key by hitting the authed /key endpoint (only openrouter.ai). */
export async function testOpenRouterKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${OPENROUTER_BASE}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function createOpenRouterPlayer(
  config: OpenRouterConfig,
  displayName?: string,
): Player {
  const transport = createOpenRouterTransport(config);
  return {
    id: `openrouter:${config.model}`,
    displayName: displayName ?? config.model,
    kind: 'llm',
    getMove(view: PlayerView, legal: Move[]): Promise<MoveResult> {
      return runLlmMove(view, legal, {
        transport,
        price: config.price,
        systemAppendix: config.systemAppendix,
        reasoning: config.reasoning,
        // Space out retries so BYOK keys don't flood OpenRouter with back-to-back
        // calls; a 429 backs off ~2s. Overridable via `runner` (tests pass 0).
        retryDelayMs: 700,
        rateLimitDelayMs: 2000,
        ...config.runner,
      });
    },
  };
}
