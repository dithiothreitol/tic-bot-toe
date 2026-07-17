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
