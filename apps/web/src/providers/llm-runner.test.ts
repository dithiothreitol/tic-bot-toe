import { TICTACTOE_VARIANTS, ticTacToe } from '@arena/game-core';

import {
  type ChatCompletion,
  type ChatMessage,
  classifyTransportError,
  runLlmMove,
} from './llm-runner';

function viewAndLegal() {
  const s = ticTacToe.createInitialState(TICTACTOE_VARIANTS[0], {});
  return {
    view: ticTacToe.viewFor(s, 'p1'),
    legal: ticTacToe.legalMoves(s, 'p1'), // [0..8]
  };
}

/** now() steps by `step` each call; each attempt makes 2 calls → +step latency. */
function steppingClock(step = 10) {
  let t = 0;
  return () => {
    const cur = t;
    t += step;
    return cur;
  };
}

/** Transport that returns queued responses (last one repeats) and records calls. */
function scriptedTransport(steps: Array<ChatCompletion | Error>) {
  const calls: ChatMessage[][] = [];
  let i = 0;
  const transport = async (messages: ChatMessage[]): Promise<ChatCompletion> => {
    calls.push(messages.map((m) => ({ ...m })));
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (step instanceof Error) throw step;
    return step as ChatCompletion;
  };
  return { transport, calls };
}

const price = { prompt: 0.001, completion: 0.002 };

describe('runLlmMove', () => {
  it('parses a valid move on the first attempt', async () => {
    const { view, legal } = viewAndLegal();
    const { transport, calls } = scriptedTransport([
      { text: '{"move": 4}', promptTokens: 20, completionTokens: 5 },
    ]);

    const result = await runLlmMove(view, legal, {
      transport,
      price,
      now: steppingClock(10),
    });

    expect(result.move).toBe(4);
    expect(result.telemetry.retries).toBe(0);
    expect(result.telemetry.forfeit).toBe(false);
    expect(result.telemetry.latencyMs).toBe(10);
    expect(result.telemetry.promptTokens).toBe(20);
    expect(result.telemetry.completionTokens).toBe(5);
    expect(result.telemetry.costUsd).toBeCloseTo(20 * 0.001 + 5 * 0.002, 10);
    expect(result.raw).toBe('{"move": 4}');
    // First call carries exactly the system + user prompt.
    expect(calls[0]).toHaveLength(2);
    expect(calls[0][0].role).toBe('system');
    expect(calls[0][1].role).toBe('user');
  });

  it('forwards onReasoningDelta to the transport (live stream channel, §3.4)', async () => {
    const { view, legal } = viewAndLegal();
    const seen: Array<((d: string) => void) | undefined> = [];
    // A transport that records the streaming callback and drives it once.
    const transport = async (
      _m: ChatMessage[],
      _s: AbortSignal,
      onReasoningDelta?: (d: string) => void,
    ): Promise<ChatCompletion> => {
      seen.push(onReasoningDelta);
      onReasoningDelta?.('live');
      return { text: '{"move": 4}' };
    };
    const deltas: string[] = [];
    const result = await runLlmMove(view, legal, {
      transport,
      onReasoningDelta: (d) => deltas.push(d),
    });
    expect(result.move).toBe(4);
    expect(seen[0]).toBeTypeOf('function'); // the runner handed the callback through
    expect(deltas).toEqual(['live']);
  });

  it('retries with a corrective message then succeeds', async () => {
    const { view, legal } = viewAndLegal();
    const { transport, calls } = scriptedTransport([
      { text: 'I think I will pass', promptTokens: 10, completionTokens: 3 },
      { text: '{"move": 0}', promptTokens: 12, completionTokens: 2 },
    ]);

    const result = await runLlmMove(view, legal, {
      transport,
      price,
      now: steppingClock(10),
    });

    expect(result.move).toBe(0);
    expect(result.telemetry.retries).toBe(1);
    expect(result.telemetry.forfeit).toBe(false);
    expect(result.telemetry.latencyMs).toBe(20); // 2 attempts
    // Tokens summed across both attempts.
    expect(result.telemetry.promptTokens).toBe(22);
    expect(result.telemetry.completionTokens).toBe(5);
    // The second call includes the model's bad answer + a correction listing legals.
    expect(calls[1]).toHaveLength(4);
    expect(calls[1][2]).toEqual({ role: 'assistant', content: 'I think I will pass' });
    expect(calls[1][3].role).toBe('user');
    expect(calls[1][3].content).toContain('legal moves');
  });

  it('forfeits to a random legal move after exhausting retries', async () => {
    const { view, legal } = viewAndLegal();
    const { transport, calls } = scriptedTransport([{ text: 'no valid move here' }]);

    const result = await runLlmMove(view, legal, {
      transport,
      rng: () => 0, // → legal[0]
      now: steppingClock(10),
    });

    expect(result.telemetry.forfeit).toBe(true);
    expect(result.telemetry.retries).toBe(3);
    expect(legal).toContain(result.move);
    expect(result.move).toBe(0);
    expect(calls).toHaveLength(4); // initial + 3 retries
    expect(result.telemetry.latencyMs).toBe(40);
  });

  it('names no_credits on a forfeit when the transport 402s every attempt', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([new Error('OpenRouter 402: insufficient credits')]);

    const result = await runLlmMove(view, legal, { transport, rng: () => 0 });

    expect(result.telemetry.forfeit).toBe(true);
    expect(result.telemetry.error).toBe('no_credits');
  });

  it('names rate_limited on a forfeit when the transport 429s every attempt', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([new Error('OpenRouter 429: rate limit')]);

    const result = await runLlmMove(view, legal, { transport, rng: () => 0 });

    expect(result.telemetry.error).toBe('rate_limited');
  });

  it('names bad_output when the model answers but never gives a legal move', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'no valid move here' }]);

    const result = await runLlmMove(view, legal, { transport, rng: () => 0 });

    expect(result.telemetry.forfeit).toBe(true);
    expect(result.telemetry.error).toBe('bad_output');
  });

  it('leaves error unset on a successful move', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: '{"move": 4}' }]);

    const result = await runLlmMove(view, legal, { transport });

    expect(result.telemetry.forfeit).toBe(false);
    expect(result.telemetry.error).toBeUndefined();
  });

  it('picks the forfeit move deterministically from rng', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'garbage' }]);

    const result = await runLlmMove(view, legal, {
      transport,
      rng: () => 0.999, // floor(0.999 * 9) = 8
    });

    expect(result.move).toBe(8);
    expect(result.telemetry.forfeit).toBe(true);
  });

  it('treats a transport error as a failed attempt and recovers', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([
      new Error('network down'),
      { text: '{"move": 2}' },
    ]);

    const result = await runLlmMove(view, legal, { transport });

    expect(result.move).toBe(2);
    expect(result.telemetry.retries).toBe(1);
    expect(result.telemetry.forfeit).toBe(false);
  });

  it('leaves token fields undefined when usage is absent (rendered as "—", not 0)', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: '{"move": 1}' }]);

    const result = await runLlmMove(view, legal, { transport, price });

    expect(result.telemetry.promptTokens).toBeUndefined();
    expect(result.telemetry.completionTokens).toBeUndefined();
    expect(result.telemetry.costUsd).toBeUndefined();
  });

  it('reports tokens but no cost when price is unknown', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([
      { text: '{"move": 3}', promptTokens: 8, completionTokens: 4 },
    ]);

    const result = await runLlmMove(view, legal, { transport });

    expect(result.telemetry.promptTokens).toBe(8);
    expect(result.telemetry.completionTokens).toBe(4);
    expect(result.telemetry.costUsd).toBeUndefined();
  });

  it('throws when there are no legal moves', async () => {
    const { view } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: '{"move": 0}' }]);
    await expect(runLlmMove(view, [], { transport })).rejects.toThrow(/no legal moves/);
  });

  // ── Retry backoff (429 flooding) ──────────────────────────────────────────
  it('backs off between retries, waiting longer after a 429', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([
      new Error('OpenRouter 429: rate limit'),
      { text: '{"move": 2}' },
    ]);
    const waits: number[] = [];

    const result = await runLlmMove(view, legal, {
      transport,
      retryDelayMs: 700,
      rateLimitDelayMs: 2000,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(result.move).toBe(2);
    // Attempt 0 hit a 429 → the wait before attempt 1 uses the 429 delay (×1).
    expect(waits).toEqual([2000]);
  });

  it('does not wait when no delay is configured (default fast path)', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'bad' }, { text: '{"move": 1}' }]);
    const sleep = vi.fn(() => Promise.resolve());

    await runLlmMove(view, legal, { transport, sleep });

    expect(sleep).not.toHaveBeenCalled();
  });

  // ── Prompt lab (§12.4) ────────────────────────────────────────────────────
  it('appends the lab systemAppendix AFTER the core system prompt', async () => {
    const { view, legal } = viewAndLegal();
    const { transport, calls } = scriptedTransport([{ text: '{"move": 4}' }]);

    await runLlmMove(view, legal, {
      transport,
      systemAppendix: 'Play aggressively.',
    });

    const system = calls[0][0];
    expect(system.role).toBe('system');
    // Core prompt stays intact and comes first; the appendix is tacked on the end.
    expect(system.content.endsWith('Play aggressively.')).toBe(true);
    expect(system.content.indexOf('Play aggressively.')).toBeGreaterThan(0);
    // The core response-format instruction still precedes the appendix.
    const { system: core } = ticTacToe.renderPrompt(view, legal);
    expect(system.content.startsWith(core)).toBe(true);
  });

  it('leaves the system prompt untouched when the appendix is blank', async () => {
    const { view, legal } = viewAndLegal();
    const { transport, calls } = scriptedTransport([{ text: '{"move": 4}' }]);

    await runLlmMove(view, legal, { transport, systemAppendix: '   ' });

    const { system: core } = ticTacToe.renderPrompt(view, legal);
    expect(calls[0][0].content).toBe(core);
  });
});

describe('runLlmMove — rejection capture (Module B, D4)', () => {
  it('captures an unparseable reply as an excerpt, no reason/attempted', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'no move here' }, { text: '{"move": 0}' }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.move).toBe(0);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections![0]).toMatchObject({ kind: 'unparseable', raw: 'no move here' });
    expect(result.rejections![0].reason).toBeUndefined();
    expect(result.rejections![0].attempted).toBeUndefined();
  });

  it('captures a transport failure as kind "transport" with no excerpt', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([new Error('network down'), { text: '{"move": 2}' }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.move).toBe(2);
    expect(result.rejections).toEqual([{ kind: 'transport' }]);
  });

  it('leaves rejections undefined on a clean first-try move', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: '{"move": 4}' }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.rejections).toBeUndefined();
  });

  it('caps captured rejections at 4 (maxRetries+1) on a full forfeit', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'garbage' }]); // repeats → 4 attempts
    const result = await runLlmMove(view, legal, { transport, rng: () => 0 });
    expect(result.telemetry.forfeit).toBe(true);
    expect(result.rejections).toHaveLength(4);
    expect(result.rejections!.every((r) => r.kind === 'unparseable')).toBe(true);
  });

  it('trims a long excerpt to the 240-char cap', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'z'.repeat(500) }, { text: '{"move": 1}' }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.rejections![0]!.raw).toHaveLength(240);
  });
});

describe('runLlmMove — reasoning trace capture (Module A, D4)', () => {
  it('captures the provider reasoning trace on a successful move', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: '{"move": 4}', reasoning: 'take the center' }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.thoughts).toBe('take the center');
  });

  it('trims a long trace to THOUGHTS_MAX_CHARS (1500)', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: '{"move": 4}', reasoning: 'x'.repeat(3000) }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.thoughts).toHaveLength(1500);
  });

  it('in lab CoT mode, uses the text before the JSON when there is no trace field', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'I will take the center. {"move": 4}' }]);
    const result = await runLlmMove(view, legal, { transport, reasoning: true });
    expect(result.thoughts).toBe('I will take the center.');
  });

  it('prefers the provider trace over content extraction, even in lab mode', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: 'blah {"move": 4}', reasoning: 'real trace' }]);
    const result = await runLlmMove(view, legal, { transport, reasoning: true });
    expect(result.thoughts).toBe('real trace');
  });

  it('leaves thoughts undefined with no trace and no lab reasoning', async () => {
    const { view, legal } = viewAndLegal();
    const { transport } = scriptedTransport([{ text: '{"move": 4}' }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.thoughts).toBeUndefined();
  });
});

describe('classifyTransportError', () => {
  it('maps HTTP statuses from provider error messages', () => {
    expect(classifyTransportError(new Error('OpenRouter 429: rate'))).toBe('rate_limited');
    expect(classifyTransportError(new Error('OpenRouter 402: no funds'))).toBe('no_credits');
    expect(classifyTransportError(new Error('OpenRouter 401: bad key'))).toBe('auth');
    expect(classifyTransportError(new Error('OpenRouter 403: forbidden'))).toBe('auth');
    expect(classifyTransportError(new Error('OpenRouter 404: no model'))).toBe('unavailable');
    expect(classifyTransportError(new Error('Ollama 500'))).toBe('unavailable');
  });

  it('maps aborts / timeouts', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(classifyTransportError(abort)).toBe('timeout');
    expect(classifyTransportError(new Error('request timed out'))).toBe('timeout');
  });

  it('falls back to network for an unrecognised shape', () => {
    expect(classifyTransportError(new Error('Failed to fetch'))).toBe('network');
    expect(classifyTransportError('boom')).toBe('network');
    expect(classifyTransportError(null)).toBe('network');
  });
});
