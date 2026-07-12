import type { Move, MoveResult, Player, PlayerView } from '@arena/game-core';

import { type ChatTransport, type LlmMoveConfig, runLlmMove } from './llm-runner';

/**
 * Ollama provider (SPEC §2.3): talks to the local Ollama daemon through our
 * server proxy (/api/ollama), which serializes requests. Free (owner's CPU),
 * so no cost; matches are server_verified. Only available when ENABLE_OLLAMA.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface OllamaModel {
  name: string;
}

export async function fetchOllamaModels(fetchImpl: typeof fetch = fetch): Promise<OllamaModel[]> {
  try {
    const res = await fetchImpl(`${API_BASE}/api/ollama/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    return (data.models ?? [])
      .filter((m): m is { name: string } => typeof m.name === 'string')
      .map((m) => ({ name: m.name }));
  } catch {
    return [];
  }
}

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaConfig {
  temperature?: number;
  maxTokens?: number;
  /** Prompt-lab appendix (§12.4), appended after the core system prompt. */
  systemAppendix?: string;
  fetchImpl?: typeof fetch;
  runner?: Pick<LlmMoveConfig, 'maxRetries' | 'timeoutMs' | 'rng' | 'now'>;
}

export function createOllamaTransport(model: string, config: OllamaConfig = {}): ChatTransport {
  const doFetch = config.fetchImpl ?? fetch;
  return async (messages, signal) => {
    const res = await doFetch(`${API_BASE}/api/ollama/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: config.temperature ?? 0.2,
          num_predict: config.maxTokens ?? 60,
        },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = (await res.json()) as OllamaChatResponse;
    return {
      text: data.message?.content ?? '',
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count,
    };
  };
}

export function createOllamaPlayer(
  model: string,
  displayName: string,
  config: OllamaConfig = {},
): Player {
  const transport = createOllamaTransport(model, config);
  return {
    id: `ollama:${model}`,
    displayName,
    kind: 'llm',
    getMove(view: PlayerView, legal: Move[]): Promise<MoveResult> {
      return runLlmMove(view, legal, {
        transport,
        systemAppendix: config.systemAppendix,
        ...config.runner,
      });
    },
  };
}
