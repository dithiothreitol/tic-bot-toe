import { TICTACTOE_VARIANTS, ticTacToe } from '@arena/game-core';

import {
  WEBLLM_MODELS,
  type WebLlmEngine,
  type WebLlmEngineFactory,
  createWebLlmPlayer,
  createWebLlmTransport,
  isWebGpuAvailable,
  smallestWebLlmModel,
} from './webllm';

function fakeEngine(content: string): WebLlmEngine {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
      },
    },
  };
}

describe('isWebGpuAvailable', () => {
  it('reflects navigator.gpu presence', () => {
    const original = (navigator as { gpu?: unknown }).gpu;
    Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
    expect(isWebGpuAvailable()).toBe(true);
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    expect(isWebGpuAvailable()).toBe(false);
    Object.defineProperty(navigator, 'gpu', { value: original, configurable: true });
  });
});

describe('smallestWebLlmModel (home-page demo, D9)', () => {
  it('picks the model with the lowest download size', () => {
    const picked = smallestWebLlmModel();
    const minMb = Math.min(...WEBLLM_MODELS.map((m) => m.downloadMb));
    expect(picked.downloadMb).toBe(minMb);
    // Every model carries a positive size for the "~N GB" warning.
    expect(WEBLLM_MODELS.every((m) => m.downloadMb > 0)).toBe(true);
  });
});

describe('WebLLM transport', () => {
  const factory: WebLlmEngineFactory = async (_mlcId, onProgress) => {
    onProgress?.(0.5, 'ładowanie');
    onProgress?.(1, 'gotowe');
    return fakeEngine('{"move": 4}');
  };

  it('loads an engine and maps the completion to text + runtime tokens', async () => {
    const progress: number[] = [];
    const transport = createWebLlmTransport('fake-model-a', {
      factory,
      onProgress: (p) => progress.push(p),
    });
    const out = await transport([{ role: 'user', content: 'hi' }], new AbortController().signal);
    expect(out.text).toBe('{"move": 4}');
    expect(out.promptTokens).toBe(12);
    expect(out.completionTokens).toBe(3);
    expect(progress).toContain(1);
  });

  it('getMove returns a legal move with NO cost (free provider)', async () => {
    const player = createWebLlmPlayer('fake-model-b', 'Fake', {
      factory,
      onProgress: () => {},
    });
    const s = ticTacToe.createInitialState(TICTACTOE_VARIANTS[0], {});
    const res = await player.getMove(
      ticTacToe.viewFor(s, 'p1'),
      ticTacToe.legalMoves(s, 'p1'),
    );
    expect(res.move).toBe(4);
    expect(res.telemetry.promptTokens).toBe(12);
    expect(res.telemetry.costUsd).toBeUndefined();
    expect(player.id).toBe('webllm:fake-model-b');
    expect(player.kind).toBe('llm');
  });
});
