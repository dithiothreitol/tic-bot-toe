import {
  type GameDefinition,
  type Move,
  type MoveResult,
  type MoveTelemetry,
  type PlayerView,
  getGame,
} from '@arena/game-core';

/**
 * Shared LLM move machinery (SPEC §8): build the prompt from the view, call the
 * provider transport, parse, retry with a corrective message on an invalid move
 * (max 3 retries), and forfeit to a random legal move when the model can't
 * comply. Telemetry (latency, tokens, cost) is collected here so every provider
 * — OpenRouter, WebLLM, Ollama — reuses identical logic and stays a thin
 * transport.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletion {
  text: string;
  /** From the API `usage` field / runtime stats; omit when unknown. */
  promptTokens?: number;
  completionTokens?: number;
}

/** Provider-specific transport. Rejects on network error / timeout / abort. */
export type ChatTransport = (
  messages: ChatMessage[],
  signal: AbortSignal,
) => Promise<ChatCompletion>;

export interface TokenPrice {
  /** USD per prompt token (snapshot from the catalog at match time). */
  prompt: number;
  /** USD per completion token. */
  completion: number;
}

export interface LlmMoveConfig {
  transport: ChatTransport;
  /** Corrective retries before forfeiting (SPEC §8, telemetry retries 0..3). */
  maxRetries?: number;
  /** Per-attempt timeout (SPEC §8 = 30s). */
  timeoutMs?: number;
  /** Price snapshot for cost; omit when free/unknown (WebLLM). */
  price?: TokenPrice;
  /** Injectable RNG in [0,1) for the forfeit move (deterministic in tests). */
  rng?: () => number;
  /** Injectable monotonic clock in ms (deterministic latency in tests). */
  now?: () => number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

function correction(legal: Move[]): string {
  return (
    `That was not a valid move. Choose ONLY from these legal moves: ${legal.join(', ')}. ` +
    `Respond with ONLY the required JSON object, nothing else.`
  );
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

interface TelemetryAccumulator {
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  sawTokens: boolean;
}

function finalizeTelemetry(
  acc: TelemetryAccumulator,
  retries: number,
  forfeit: boolean,
  price: TokenPrice | undefined,
): MoveTelemetry {
  const telemetry: MoveTelemetry = {
    latencyMs: Math.round(acc.latencyMs),
    retries,
    forfeit,
  };
  // Missing token usage stays `undefined` (rendered as "—", never 0 — SPEC §20.1).
  if (acc.sawTokens) {
    telemetry.promptTokens = acc.promptTokens;
    telemetry.completionTokens = acc.completionTokens;
    if (price) {
      telemetry.costUsd =
        acc.promptTokens * price.prompt + acc.completionTokens * price.completion;
    }
  }
  return telemetry;
}

export async function runLlmMove(
  view: PlayerView,
  legal: Move[],
  config: LlmMoveConfig,
): Promise<MoveResult> {
  if (legal.length === 0) {
    throw new Error('runLlmMove: no legal moves to choose from');
  }

  const def = getGame(view.game) as GameDefinition<unknown, Move>;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = config.now ?? defaultNow;
  const rng = config.rng ?? Math.random;

  const { system, user } = def.renderPrompt(view, legal);
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const acc: TelemetryAccumulator = {
    latencyMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    sawTokens: false,
  };

  // Attempt 0 is the first try; `retries` corrective retries follow (max 3 →
  // up to 4 calls). retries lands in 0..maxRetries, matching MoveTelemetry.
  for (let retries = 0; retries <= maxRetries; retries++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = now();
    let completion: ChatCompletion | null = null;
    try {
      completion = await config.transport(messages, controller.signal);
    } catch {
      // Network / timeout / abort — a failed attempt; keep retrying.
    } finally {
      clearTimeout(timer);
      acc.latencyMs += Math.max(0, now() - start);
    }

    if (completion) {
      if (completion.promptTokens !== undefined) {
        acc.promptTokens += completion.promptTokens;
        acc.sawTokens = true;
      }
      if (completion.completionTokens !== undefined) {
        acc.completionTokens += completion.completionTokens;
        acc.sawTokens = true;
      }
      const move = def.parseMove(completion.text, legal);
      if (move !== null) {
        return {
          move,
          telemetry: finalizeTelemetry(acc, retries, false, config.price),
          raw: completion.text,
        };
      }
      // Invalid move → show the model its answer, then correct it and retry.
      messages.push({ role: 'assistant', content: completion.text });
      messages.push({ role: 'user', content: correction(legal) });
    }
  }

  // Exhausted retries → random legal move, forfeit flagged.
  const forfeitMove = legal[Math.floor(rng() * legal.length)] ?? legal[0]!;
  return {
    move: forfeitMove,
    telemetry: finalizeTelemetry(acc, maxRetries, true, config.price),
  };
}
