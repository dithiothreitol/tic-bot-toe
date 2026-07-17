import {
  type GameDefinition,
  MAX_REJECTIONS_PER_MOVE,
  type Move,
  type MoveErrorReason,
  type MoveRejection,
  type MoveRejectionRecord,
  type MoveResult,
  type MoveTelemetry,
  type MoveValidation,
  type PlayerView,
  REJECTION_ATTEMPTED_MAX_CHARS,
  REJECTION_RAW_MAX_CHARS,
  REJECTION_REASON_MAX_CHARS,
  THOUGHTS_MAX_CHARS,
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
  /**
   * The model's reasoning trace (Module A), when the provider surfaced one
   * (OpenRouter `message.reasoning`). Kept in memory; persisted only on an
   * explicit save, trimmed (D1). WebLLM/Ollama leave it undefined.
   */
  reasoning?: string;
  /** From the API `usage` field / runtime stats; omit when unknown. */
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * The reasoning trace to persist for a move (Module A). Prefer the provider's
 * dedicated field; failing that, in lab CoT mode (`config.reasoning`) the model
 * reasons in the CONTENT before its JSON answer, so take the text preceding the
 * first `{`. Trimmed to THOUGHTS_MAX_CHARS. Undefined when there is nothing.
 */
function extractThoughts(
  completion: ChatCompletion,
  labReasoning: boolean | undefined,
): string | undefined {
  const trace = completion.reasoning?.trim();
  if (trace) return trace.slice(0, THOUGHTS_MAX_CHARS);
  if (labReasoning) {
    const brace = completion.text.indexOf('{');
    const pre = (brace > 0 ? completion.text.slice(0, brace) : '').trim();
    if (pre) return pre.slice(0, THOUGHTS_MAX_CHARS);
  }
  return undefined;
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
  /**
   * Wait this long before each corrective retry (linear backoff: ×1, ×2, …).
   * Stops the client from hammering the API back-to-back — the retries otherwise
   * fire instantly and flood the console. 0/undefined = no wait (default; tests
   * stay fast). Production wiring sets a real value.
   */
  retryDelayMs?: number;
  /**
   * Longer backoff used when the last attempt was rate-limited (HTTP 429), since
   * retrying immediately just earns another 429. Falls back to `retryDelayMs`.
   */
  rateLimitDelayMs?: number;
  /** Injectable delay (tests). Defaults to a real setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Prompt-lab appendix (SPEC §12.4). Appended AFTER the fixed core system
   * prompt so the response-format contract from §6/§7 always survives. Blank /
   * undefined = no change. Lab matches carry `lab=true` and never touch Elo.
   */
  systemAppendix?: string;
  /**
   * Let the model reason briefly before answering (flows into the game's
   * `renderPrompt`). Pairs with a higher `max_tokens` in the transport, since
   * the terse default truncates the reasoning. Reasoning matches never rank.
   */
  reasoning?: boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Terse JSON-only default (SPEC §8: 50–60). */
export const DEFAULT_MAX_TOKENS = 60;
/**
 * Reasoning mode needs room for chain-of-thought BEFORE the JSON, or the answer
 * gets cut off mid-thought and forfeits to a random move. Generous on purpose:
 * dedicated "thinking" models (o1 / R1 / reasoning-Grok) spend hidden reasoning
 * tokens against this same ceiling, so a tight cap would truncate them on every
 * move — the exact opposite of what the toggle is for. Still bounded so a
 * runaway model can't burn the budget.
 */
export const REASONING_MAX_TOKENS = 1024;

/** Per-move token ceiling a transport should request, given the reasoning flag. */
export function moveMaxTokens(reasoning?: boolean): number {
  return reasoning ? REASONING_MAX_TOKENS : DEFAULT_MAX_TOKENS;
}

function correction(legal: Move[]): string {
  return (
    `That was not a valid move. Choose ONLY from these legal moves: ${legal.join(', ')}. ` +
    `Respond with ONLY the required JSON object, nothing else.`
  );
}

function defaultSleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Name why a transport call failed so the UI can tell the player what to do,
 * instead of silently substituting a random move. Providers throw
 * `Error("OpenRouter 429: …")` / `Error("Ollama 500")`; an abort is the
 * per-move timeout. The HTTP status leads the message, so the first 3-digit run
 * is the status. Unknown shapes fall back to `network`.
 */
export function classifyTransportError(err: unknown): MoveErrorReason {
  if (err instanceof Error && err.name === 'AbortError') return 'timeout';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/(abort|time\s?d?\s?out)/i.test(msg)) return 'timeout';
  const status = /\b([45]\d\d)\b/.exec(msg)?.[1];
  if (status === '429') return 'rate_limited';
  if (status === '402') return 'no_credits';
  if (status === '401' || status === '403') return 'auth';
  if (status === '404' || status?.startsWith('5')) return 'unavailable';
  return 'network';
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
  error?: MoveErrorReason,
): MoveTelemetry {
  const telemetry: MoveTelemetry = {
    latencyMs: Math.round(acc.latencyMs),
    retries,
    forfeit,
  };
  // A named cause rides along only with a forfeit — a successful move has none.
  if (forfeit && error) telemetry.error = error;
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
  const sleep = config.sleep ?? defaultSleep;
  const retryDelayMs = config.retryDelayMs ?? 0;
  const rateLimitDelayMs = config.rateLimitDelayMs ?? retryDelayMs;

  const { system, user } = def.renderPrompt(view, legal, { reasoning: config.reasoning });
  // Lab appendix goes AFTER the core prompt — the format rules must win (§12.4).
  const appendix = config.systemAppendix?.trim();
  const systemContent = appendix ? `${system}\n\n${appendix}` : system;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    { role: 'user', content: user },
  ];

  const acc: TelemetryAccumulator = {
    latencyMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    sawTokens: false,
  };
  // The last transport rejection, kept so a forfeit can name WHY (429 / 402 /
  // timeout …) instead of masquerading as a random "algo" move.
  let lastTransportError: unknown = null;

  // Rejected attempts at THIS move (Module B, D4): illegal / unparseable replies
  // and transport failures, in order. Bounded by attempt count (≤ maxRetries+1),
  // capped defensively. Rides along on the returned MoveResult — success carries
  // the tries the model self-corrected past; a forfeit carries them all.
  const rejections: MoveRejectionRecord[] = [];
  const pushRejection = (r: MoveRejectionRecord): void => {
    if (rejections.length < MAX_REJECTIONS_PER_MOVE) rejections.push(r);
  };
  const trimRaw = (s: string): string => s.trim().slice(0, REJECTION_RAW_MAX_CHARS);

  // Attempt 0 is the first try; `retries` corrective retries follow (max 3 →
  // up to 4 calls). retries lands in 0..maxRetries, matching MoveTelemetry.
  for (let retries = 0; retries <= maxRetries; retries++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = now();
    let completion: ChatCompletion | null = null;
    try {
      completion = await config.transport(messages, controller.signal);
    } catch (err) {
      // Network / timeout / abort — a failed attempt; keep retrying, but keep
      // the reason for the forfeit telemetry. Recorded as a `transport` rejection
      // (no excerpt — nothing came back), kept OUT of the hallucination metric:
      // an infra failure is not the model inventing a move (D5).
      lastTransportError = err;
      pushRejection({ kind: 'transport' });
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
      // Parse recovers the move SYNTACTICALLY; legality is a separate step so
      // games with a non-enumerable/hidden legal set (scrabble, sudoku) can
      // decide it via `validateMove` on the view (plan §3). Existing games have
      // no hook, so this collapses to the old `legal.includes` behaviour.
      const parsed = def.parseMove(completion.text, legal);
      const validity: MoveValidation | null =
        parsed === null
          ? null
          : def.validateMove
            ? def.validateMove(view, parsed)
            : legal.includes(parsed)
              ? { ok: true }
              : { ok: false, reason: 'not a legal move' };

      if (parsed !== null && validity?.ok) {
        const thoughts = extractThoughts(completion, config.reasoning);
        return {
          move: parsed,
          telemetry: finalizeTelemetry(acc, retries, false, config.price),
          raw: completion.text,
          ...(thoughts ? { thoughts } : {}),
          ...(rejections.length ? { rejections: [...rejections] } : {}),
        };
      }

      // Invalid/unparseable move → show the model its answer, then correct it and
      // retry. A parsed-but-rejected move carries a reason; a parse failure does
      // not. Games may render their own correction (no full legal-list dump).
      const rejection: MoveRejection | undefined =
        validity && !validity.ok ? validity : undefined;

      // Capture the rejected attempt for the museum + discipline metric (Module
      // B, D4). Illegal: the engine's reason + what the model tried (for scrabble
      // the notation carries the invented word); unparseable: only an excerpt.
      if (parsed === null) {
        pushRejection({ kind: 'unparseable', raw: trimRaw(completion.text) });
      } else {
        pushRejection({
          kind: 'illegal',
          reason: rejection?.reason.slice(0, REJECTION_REASON_MAX_CHARS),
          attempted: String(parsed).slice(0, REJECTION_ATTEMPTED_MAX_CHARS),
          raw: trimRaw(completion.text),
        });
      }

      const correctionMsg = def.renderCorrection
        ? def.renderCorrection(view, rejection)
        : correction(legal);
      messages.push({ role: 'assistant', content: completion.text });
      messages.push({ role: 'user', content: correctionMsg });
    }

    // Back off before the next attempt so we stop hammering the API. A 429 waits
    // longer (retrying immediately just earns another). Linear ramp by attempt.
    // Skipped after the final attempt (nothing follows it) and when delay is 0.
    if (retries < maxRetries) {
      const rateLimited =
        lastTransportError !== null &&
        classifyTransportError(lastTransportError) === 'rate_limited';
      const base = rateLimited ? rateLimitDelayMs : retryDelayMs;
      if (base > 0) await sleep(base * (retries + 1));
    }
  }

  // Exhausted retries → random legal move, forfeit flagged. Name the cause: a
  // transport failure (429/402/timeout/…) if one occurred, else `bad_output`
  // (the model answered but never gave a legal move).
  const reason: MoveErrorReason = lastTransportError
    ? classifyTransportError(lastTransportError)
    : 'bad_output';
  // Games may override the forfeit substitute (scrabble → 'PASS'); default is a
  // random legal move (plan §3).
  const forfeitMove = def.fallbackMove
    ? def.fallbackMove(view, legal, rng)
    : (legal[Math.floor(rng() * legal.length)] ?? legal[0]!);
  return {
    move: forfeitMove,
    telemetry: finalizeTelemetry(acc, maxRetries, true, config.price, reason),
    ...(rejections.length ? { rejections: [...rejections] } : {}),
  };
}
