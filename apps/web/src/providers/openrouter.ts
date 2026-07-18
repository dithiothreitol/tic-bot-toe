import type { Move, MoveResult, Player, PlayerView } from '@arena/game-core';

import {
  type ChatCompletion,
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
  /**
   * The MODEL itself does hidden chain-of-thought (o1 / R1 / MiMo …), distinct
   * from the `reasoning` match toggle. Those hidden tokens count against
   * `max_tokens`, so the terse 60-token ceiling is spent thinking and the model
   * returns empty content — every move then forfeits as "bad_output". Lift the
   * ceiling for these models even when the toggle is off, WITHOUT switching the
   * prompt to CoT or unranking (the output contract stays terse JSON).
   */
  reasoningModel?: boolean;
  /**
   * Surface the model's reasoning trace (Module A): ask OpenRouter to return
   * `message.reasoning` by sending `reasoning: { enabled: true }`, and read it
   * back. Defaults to `reasoningModel` — the SAME catalog signal (a model that
   * does hidden CoT is exactly the one with a trace worth capturing), so no
   * separate wiring is needed. It uses the model's OWN effort, so the move (and
   * the ranking) is unchanged (D2). A model that rejects the param (4xx) is
   * retried once without it (D3) — capturing a trace never breaks play.
   */
  reasoningCapture?: boolean;
  /**
   * Live reasoning stream (Module A, plan §3.4). When present AND the model is
   * reasoning-capable, the transport streams (`stream: true`) and calls this with
   * each reasoning fragment as it arrives, so the UI types the trace out live.
   * The final result is identical to the non-streaming path (D2). Omit → the plain
   * one-shot request.
   */
  onReasoningDelta?: (delta: string) => void;
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
  choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** One SSE chunk in stream mode: content/reasoning arrive as `delta`, usage at the end. */
interface OpenRouterStreamChunk {
  choices?: Array<{ delta?: { content?: string | null; reasoning?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Non-streaming shape → ChatCompletion (also the fallback when a "stream" reply is plain JSON). */
async function readJson(res: Response): Promise<ChatCompletion> {
  const data = (await res.json()) as OpenRouterResponse;
  const message = data.choices?.[0]?.message;
  return {
    text: message?.content ?? '',
    reasoning: message?.reasoning ?? undefined,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
  };
}

/**
 * Parse an OpenRouter SSE stream into the SAME ChatCompletion the JSON path
 * returns, calling `onReasoningDelta` with each reasoning fragment as it lands.
 * Lines that are not `data:` payloads (SSE comments like `: OPENROUTER PROCESSING`)
 * are skipped; `[DONE]` ends the stream. A malformed chunk is skipped, never fatal.
 */
async function readSse(
  res: Response,
  onReasoningDelta?: (delta: string) => void,
): Promise<ChatCompletion> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let reasoning = '';
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  const processLine = (raw: string): void => {
    const line = raw.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return;
    let chunk: OpenRouterStreamChunk;
    try {
      chunk = JSON.parse(payload) as OpenRouterStreamChunk;
    } catch {
      return; // partial/keepalive line — ignore
    }
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) text += delta.content;
    if (delta?.reasoning) {
      reasoning += delta.reasoning;
      onReasoningDelta?.(delta.reasoning);
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
      completionTokens = chunk.usage.completion_tokens ?? completionTokens;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        processLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    // Flush a final event the stream may have ended on without a trailing newline
    // (defensive — OpenRouter terminates events with \n\n, but a proxy might not).
    if (buffer.length > 0) processLine(buffer);
  } finally {
    // Let go of the stream even if a read rejected (abort/timeout mid-stream).
    reader.releaseLock();
  }
  return { text, reasoning: reasoning || undefined, promptTokens, completionTokens };
}

function defaultReferer(): string {
  return typeof location !== 'undefined' && location.origin
    ? location.origin
    : 'https://tic-bot-toe.local';
}

/** Statuses that mean "your request shape is wrong" — the only ones worth the
 *  param-less D3 retry. 401/402/403/429 are auth/credits/rate: retrying without
 *  the reasoning param would just earn the same error. */
const REASONING_PARAM_REJECTED = new Set([400, 404, 422]);

export function createOpenRouterTransport(config: OpenRouterConfig): ChatTransport {
  const doFetch = config.fetchImpl ?? fetch;
  // Capture the reasoning trace for reasoning-capable models by default (same
  // catalog signal as the roomier ceiling), or when a caller opts in explicitly.
  const captureReasoning = config.reasoningCapture ?? config.reasoningModel ?? false;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'HTTP-Referer': config.referer ?? defaultReferer(),
    'X-Title': config.title ?? 'tic-bot-toe',
  };
  return async (messages, signal, onReasoningDelta) => {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.2,
      // A reasoning model needs the roomy ceiling to emit any content at all,
      // even when the match-level reasoning toggle is off (see reasoningModel).
      max_tokens: config.maxTokens ?? moveMaxTokens(config.reasoning || config.reasoningModel),
    };
    // Ask OpenRouter to include the model's OWN reasoning trace (Module A). Effort
    // stays the model default — we only surface what it already produces (D2).
    if (captureReasoning) body.reasoning = { enabled: true };

    // Stream only when there is a live trace worth typing out: a reasoning-capable
    // model AND a caller listening (§3.4). Delivery-only — the assembled result is
    // identical to the one-shot path, so the move and the ranking are unchanged.
    const streaming = captureReasoning && typeof onReasoningDelta === 'function';
    if (streaming) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }

    const post = (b: Record<string, unknown>): Promise<Response> =>
      doFetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(b),
        signal,
      });

    let res = await post(body);
    // D3: a model that rejects the `reasoning` param (or streaming) answers 4xx.
    // Retry ONCE as a plain non-streaming, param-less request so trace capture
    // never turns a playable model unplayable.
    if (captureReasoning && !res.ok && REASONING_PARAM_REJECTED.has(res.status)) {
      const { reasoning: _dropped, stream: _s, stream_options: _so, ...plain } = body;
      res = await post(plain);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 200)}`);
    }

    // Read as a stream only if we asked for one AND the server actually sent one;
    // a proxy that answered our stream request with plain JSON still parses. The
    // header access is optional-chained so it never trips on a minimal Response.
    const wantsStream =
      streaming &&
      res.body != null &&
      (res.headers?.get?.('content-type') ?? '').includes('text/event-stream');
    return wantsStream ? readSse(res, onReasoningDelta) : readJson(res);
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
        onReasoningDelta: config.onReasoningDelta,
        // Space out retries so BYOK keys don't flood OpenRouter with back-to-back
        // calls; a 429 backs off ~2s. Overridable via `runner` (tests pass 0).
        retryDelayMs: 700,
        rateLimitDelayMs: 2000,
        ...config.runner,
      });
    },
  };
}
