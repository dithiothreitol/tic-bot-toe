import { TICTACTOE_VARIANTS, ticTacToe } from '@arena/game-core';

import { DEFAULT_MAX_TOKENS, REASONING_MAX_TOKENS } from './llm-runner';
import {
  OPENROUTER_BASE,
  createOpenRouterPlayer,
  createOpenRouterTransport,
} from './openrouter';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function fakeFetch(response: Response) {
  const calls: FetchCall[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Fetch that returns a different queued response per call (last one repeats). */
function fakeFetchSeq(responses: Response[]) {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return Promise.resolve(r);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const chatBody = {
  choices: [{ message: { content: '{"move": 4}' } }],
  usage: { prompt_tokens: 10, completion_tokens: 2 },
};

/** A fake SSE Response whose body streams the given text (optionally in slices). */
function sseResponse(slices: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const s of slices) controller.enqueue(encoder.encode(s));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body,
    json: async () => {
      throw new Error('a stream must not be JSON-parsed');
    },
    text: async () => slices.join(''),
  } as unknown as Response;
}

const SSE_MOVE = [
  'data: {"choices":[{"delta":{"reasoning":"I take "}}]}\n\n',
  'data: {"choices":[{"delta":{"reasoning":"the center."}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"{\\"move\\": 4}"}}]}\n\n',
  'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":3}}\n\n',
  'data: [DONE]\n\n',
];

describe('OpenRouter provider — key isolation (SPEC hard constraint)', () => {
  it('sends the request ONLY to openrouter.ai with the key in the Authorization header', async () => {
    const { fetchImpl, calls } = fakeFetch(okJson(chatBody));
    const transport = createOpenRouterTransport({
      model: 'vendor/model',
      apiKey: 'sk-or-secret',
      fetchImpl,
      referer: 'https://app.test',
    });

    await transport([{ role: 'user', content: 'hi' }], new AbortController().signal);

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).host).toBe('openrouter.ai');
    expect(calls[0].url.startsWith(OPENROUTER_BASE)).toBe(true);

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-or-secret');
    expect(headers['HTTP-Referer']).toBe('https://app.test');

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe('vendor/model');
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(60);
    // The key appears in NO other field of the outgoing request.
    expect(JSON.stringify(body)).not.toContain('sk-or-secret');
  });

  it('lifts max_tokens for a reasoning model so hidden CoT does not truncate the answer', async () => {
    const { fetchImpl, calls } = fakeFetch(okJson(chatBody));
    const transport = createOpenRouterTransport({
      model: 'xiaomi/mimo-v2.5',
      apiKey: 'k',
      fetchImpl,
      reasoningModel: true, // toggle OFF, but the MODEL reasons → still needs room
    });

    await transport([{ role: 'user', content: 'hi' }], new AbortController().signal);

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.max_tokens).toBe(REASONING_MAX_TOKENS);
    expect(body.max_tokens).toBeGreaterThan(DEFAULT_MAX_TOKENS);
  });

  it('extracts text + usage tokens from the completion', async () => {
    const { fetchImpl } = fakeFetch(okJson(chatBody));
    const transport = createOpenRouterTransport({ model: 'v/m', apiKey: 'k', fetchImpl });
    const out = await transport([{ role: 'user', content: 'hi' }], new AbortController().signal);
    expect(out.text).toBe('{"move": 4}');
    expect(out.promptTokens).toBe(10);
    expect(out.completionTokens).toBe(2);
  });

  it('throws on a non-ok response', async () => {
    const bad = { ok: false, status: 429, text: async () => 'rate limited' } as Response;
    const { fetchImpl } = fakeFetch(bad);
    const transport = createOpenRouterTransport({ model: 'v/m', apiKey: 'k', fetchImpl });
    await expect(
      transport([{ role: 'user', content: 'hi' }], new AbortController().signal),
    ).rejects.toThrow(/429/);
  });

  it('sends `reasoning:{enabled}` only when capture is on (off by default)', async () => {
    const on = fakeFetch(okJson(chatBody));
    await createOpenRouterTransport({
      model: 'v/m', apiKey: 'k', fetchImpl: on.fetchImpl, reasoningCapture: true,
    })([{ role: 'user', content: 'hi' }], new AbortController().signal);
    expect(JSON.parse(on.calls[0].init.body as string).reasoning).toEqual({ enabled: true });

    const off = fakeFetch(okJson(chatBody));
    await createOpenRouterTransport({ model: 'v/m', apiKey: 'k', fetchImpl: off.fetchImpl })(
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
    );
    expect(JSON.parse(off.calls[0].init.body as string).reasoning).toBeUndefined();
  });

  it('defaults capture ON for a reasoning model (same catalog signal)', async () => {
    const { fetchImpl, calls } = fakeFetch(okJson(chatBody));
    await createOpenRouterTransport({ model: 'v/m', apiKey: 'k', fetchImpl, reasoningModel: true })(
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
    );
    expect(JSON.parse(calls[0].init.body as string).reasoning).toEqual({ enabled: true });
  });

  it('reads the reasoning trace from message.reasoning', async () => {
    const { fetchImpl } = fakeFetch(
      okJson({
        choices: [{ message: { content: '{"move": 4}', reasoning: 'center controls the board' } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }),
    );
    const out = await createOpenRouterTransport({
      model: 'v/m', apiKey: 'k', fetchImpl, reasoningCapture: true,
    })([{ role: 'user', content: 'hi' }], new AbortController().signal);
    expect(out.reasoning).toBe('center controls the board');
  });

  it('retries once WITHOUT the reasoning param on a 4xx (D3), then succeeds', async () => {
    const seq = fakeFetchSeq([
      { ok: false, status: 400, text: async () => 'unknown field: reasoning' } as Response,
      okJson(chatBody),
    ]);
    const out = await createOpenRouterTransport({
      model: 'v/m', apiKey: 'k', fetchImpl: seq.fetchImpl, reasoningCapture: true,
    })([{ role: 'user', content: 'hi' }], new AbortController().signal);

    expect(seq.calls).toHaveLength(2);
    expect(JSON.parse(seq.calls[0].init.body as string).reasoning).toEqual({ enabled: true });
    expect(JSON.parse(seq.calls[1].init.body as string).reasoning).toBeUndefined();
    expect(out.text).toBe('{"move": 4}');
  });

  it('does NOT do the param-less retry on a 429 (not a param problem)', async () => {
    const seq = fakeFetchSeq([
      { ok: false, status: 429, text: async () => 'rate limited' } as Response,
      okJson(chatBody),
    ]);
    await expect(
      createOpenRouterTransport({
        model: 'v/m', apiKey: 'k', fetchImpl: seq.fetchImpl, reasoningCapture: true,
      })([{ role: 'user', content: 'hi' }], new AbortController().signal),
    ).rejects.toThrow(/429/);
    expect(seq.calls).toHaveLength(1);
  });

  it('streams the reasoning trace live and assembles the same completion (§3.4)', async () => {
    const { fetchImpl, calls } = fakeFetch(sseResponse(SSE_MOVE));
    const deltas: string[] = [];
    const out = await createOpenRouterTransport({
      model: 'v/m',
      apiKey: 'k',
      fetchImpl,
      reasoningCapture: true,
    })([{ role: 'user', content: 'hi' }], new AbortController().signal, (d) => deltas.push(d));

    // The request asked to stream, with usage in the final chunk.
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });

    // The trace arrived fragment-by-fragment (the typewriter), and the assembled
    // result matches what the one-shot path would have returned.
    expect(deltas).toEqual(['I take ', 'the center.']);
    expect(out.reasoning).toBe('I take the center.');
    expect(out.text).toBe('{"move": 4}');
    expect(out.promptTokens).toBe(10);
    expect(out.completionTokens).toBe(3);
  });

  it('reassembles correctly when SSE bytes split mid-line across chunks', async () => {
    // Split one event across two network reads — the line buffer must stitch it.
    const joined = SSE_MOVE.join('');
    const mid = Math.floor(joined.length / 2);
    const { fetchImpl } = fakeFetch(sseResponse([joined.slice(0, mid), joined.slice(mid)]));
    const deltas: string[] = [];
    const out = await createOpenRouterTransport({
      model: 'v/m', apiKey: 'k', fetchImpl, reasoningCapture: true,
    })([{ role: 'user', content: 'hi' }], new AbortController().signal, (d) => deltas.push(d));
    expect(deltas.join('')).toBe('I take the center.');
    expect(out.text).toBe('{"move": 4}');
  });

  it('parses a final event the stream ended on WITHOUT a trailing newline', async () => {
    // Same events, but the last usage line has no closing "\n\n".
    const noTrailer = [
      'data: {"choices":[{"delta":{"reasoning":"hmm"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\"move\\": 4}"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":1}}',
    ];
    const { fetchImpl } = fakeFetch(sseResponse(noTrailer));
    const deltas: string[] = [];
    const out = await createOpenRouterTransport({
      model: 'v/m', apiKey: 'k', fetchImpl, reasoningCapture: true,
    })([{ role: 'user', content: 'hi' }], new AbortController().signal, (d) => deltas.push(d));
    // The unterminated final line is still flushed → usage is not lost.
    expect(out.promptTokens).toBe(7);
    expect(out.completionTokens).toBe(1);
    expect(out.text).toBe('{"move": 4}');
    expect(deltas).toEqual(['hmm']);
  });

  it('does NOT stream without a delta listener, or without capture (no regression)', async () => {
    // Capture on, but no listener → plain one-shot request.
    const noListener = fakeFetch(okJson(chatBody));
    await createOpenRouterTransport({ model: 'v/m', apiKey: 'k', fetchImpl: noListener.fetchImpl, reasoningCapture: true })(
      [{ role: 'user', content: 'hi' }], new AbortController().signal,
    );
    expect(JSON.parse(noListener.calls[0].init.body as string).stream).toBeUndefined();

    // Listener present, but capture off → nothing to stream, still one-shot.
    const noCapture = fakeFetch(okJson(chatBody));
    await createOpenRouterTransport({ model: 'v/m', apiKey: 'k', fetchImpl: noCapture.fetchImpl })(
      [{ role: 'user', content: 'hi' }], new AbortController().signal, () => {},
    );
    expect(JSON.parse(noCapture.calls[0].init.body as string).stream).toBeUndefined();
  });

  it('falls back to a plain param-less request when the stream request is 4xx-rejected (D3)', async () => {
    const seq = fakeFetchSeq([
      { ok: false, status: 400, text: async () => 'stream unsupported' } as Response,
      okJson(chatBody),
    ]);
    const deltas: string[] = [];
    const out = await createOpenRouterTransport({
      model: 'v/m', apiKey: 'k', fetchImpl: seq.fetchImpl, reasoningCapture: true,
    })([{ role: 'user', content: 'hi' }], new AbortController().signal, (d) => deltas.push(d));

    expect(seq.calls).toHaveLength(2);
    expect(JSON.parse(seq.calls[0].init.body as string).stream).toBe(true);
    const retry = JSON.parse(seq.calls[1].init.body as string);
    expect(retry.stream).toBeUndefined();
    expect(retry.reasoning).toBeUndefined();
    expect(out.text).toBe('{"move": 4}');
    expect(deltas).toEqual([]); // nothing streamed on the fallback
  });

  it('getMove returns a legal move with cost telemetry from the price snapshot', async () => {
    const { fetchImpl } = fakeFetch(
      okJson({
        choices: [{ message: { content: '{"move": 0}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
    const player = createOpenRouterPlayer({
      model: 'v/m',
      apiKey: 'k',
      fetchImpl,
      price: { prompt: 0.001, completion: 0.002 },
    });
    const s = ticTacToe.createInitialState(TICTACTOE_VARIANTS[0], {});
    const res = await player.getMove(
      ticTacToe.viewFor(s, 'p1'),
      ticTacToe.legalMoves(s, 'p1'),
    );

    expect(res.move).toBe(0);
    expect(res.telemetry.forfeit).toBe(false);
    expect(res.telemetry.costUsd).toBeCloseTo(10 * 0.001 + 5 * 0.002, 10);
    expect(player.id).toBe('openrouter:v/m');
    expect(player.kind).toBe('llm');
  });
});
