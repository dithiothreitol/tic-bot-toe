import type { Move, MoveResult, Player, PlayerView } from '@arena/game-core';

import { useModelLoad } from '@/store/model-load';

import { type ChatTransport, type LlmMoveConfig, moveMaxTokens, runLlmMove } from './llm-runner';

/**
 * WebLLM provider (SPEC §2.2): runs small models in-browser via WebGPU — free,
 * no key, no owner cost. web-llm is heavy, so it's dynamically imported only
 * when a WebLLM model is actually used. Telemetry has tokens (runtime stats)
 * but no cost.
 */

export interface WebLlmModel {
  mlcId: string;
  name: string;
  /**
   * Approximate weight-download size in MB (q4f16_1 quant). Used ONLY for the
   * home-page demo's "this will download ~N GB" warning (D9) — a heads-up, not a
   * load-bearing number, so a rough figure is fine.
   */
  downloadMb: number;
}

export const WEBLLM_MODELS: WebLlmModel[] = [
  { mlcId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', downloadMb: 1800 },
  { mlcId: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 mini', downloadMb: 2200 },
  { mlcId: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 3B', downloadMb: 1900 },
];

/** The lightest model to download — the home-page demo picks this one (D9). */
export function smallestWebLlmModel(): WebLlmModel {
  return [...WEBLLM_MODELS].sort((a, b) => a.downloadMb - b.downloadMb)[0]!;
}

export function isWebGpuAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { gpu?: unknown }).gpu != null
  );
}

interface WebLlmChatCompletion {
  choices: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface WebLlmEngine {
  chat: {
    completions: {
      create: (req: {
        messages: { role: string; content: string }[];
        temperature?: number;
        max_tokens?: number;
        stream?: false;
      }) => Promise<WebLlmChatCompletion>;
    };
  };
}

export type WebLlmEngineFactory = (
  mlcId: string,
  onProgress?: (progress: number, text: string) => void,
) => Promise<WebLlmEngine>;

const defaultFactory: WebLlmEngineFactory = async (mlcId, onProgress) => {
  const webllm = await import('@mlc-ai/web-llm');
  const engine = await webllm.CreateMLCEngine(mlcId, {
    initProgressCallback: (report) => onProgress?.(report.progress, report.text),
  });
  return engine as unknown as WebLlmEngine;
};

const engineCache = new Map<string, Promise<WebLlmEngine>>();

function getEngine(
  mlcId: string,
  factory: WebLlmEngineFactory,
  onProgress?: (progress: number, text: string) => void,
): Promise<WebLlmEngine> {
  let cached = engineCache.get(mlcId);
  if (!cached) {
    // On failure, evict so a later attempt can retry the download.
    cached = factory(mlcId, onProgress).catch((err) => {
      engineCache.delete(mlcId);
      throw err;
    });
    engineCache.set(mlcId, cached);
  }
  return cached;
}

export interface WebLlmConfig {
  temperature?: number;
  maxTokens?: number;
  /** Prompt-lab appendix (§12.4), appended after the core system prompt. */
  systemAppendix?: string;
  /** Let the model reason before answering; also lifts the default max_tokens. */
  reasoning?: boolean;
  factory?: WebLlmEngineFactory;
  runner?: Pick<LlmMoveConfig, 'maxRetries' | 'timeoutMs' | 'rng' | 'now'>;
  /** Override the progress reporter (defaults to the model-load store). */
  onProgress?: (progress: number, text: string) => void;
}

export function createWebLlmTransport(
  mlcId: string,
  config: WebLlmConfig = {},
): ChatTransport {
  const factory = config.factory ?? defaultFactory;
  return async (messages) => {
    const usesStore = config.onProgress === undefined;
    const progress =
      config.onProgress ?? ((p, t) => useModelLoad.getState().update(p, t));
    const firstLoad = !engineCache.has(mlcId);
    if (firstLoad && usesStore) useModelLoad.getState().begin(mlcId);
    let engine: WebLlmEngine;
    try {
      engine = await getEngine(mlcId, factory, progress);
    } finally {
      if (firstLoad && usesStore) useModelLoad.getState().finish();
    }
    const completion = await engine.chat.completions.create({
      messages,
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? moveMaxTokens(config.reasoning),
      stream: false,
    });
    return {
      text: completion.choices[0]?.message?.content ?? '',
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    };
  };
}

export function createWebLlmPlayer(
  mlcId: string,
  displayName: string,
  config: WebLlmConfig = {},
): Player {
  const transport = createWebLlmTransport(mlcId, config);
  return {
    id: `webllm:${mlcId}`,
    displayName,
    kind: 'llm',
    // No price → costUsd stays undefined (free).
    getMove(view: PlayerView, legal: Move[]): Promise<MoveResult> {
      return runLlmMove(view, legal, {
        transport,
        systemAppendix: config.systemAppendix,
        reasoning: config.reasoning,
        ...config.runner,
      });
    },
  };
}
