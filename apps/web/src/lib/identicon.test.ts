import { describe, expect, it } from 'vitest';

import { IDENTICON_SIZE, identiconCells } from './identicon';

const N = IDENTICON_SIZE;

describe('identiconCells', () => {
  it('is deterministic for the same id', () => {
    expect(identiconCells('openrouter:anthropic/claude-sonnet-4')).toEqual(
      identiconCells('openrouter:anthropic/claude-sonnet-4'),
    );
  });

  it('differs between models', () => {
    const a = identiconCells('openrouter:anthropic/claude-sonnet-4');
    const b = identiconCells('openrouter:meta-llama/llama-3.1-405b-instruct');
    expect(a).not.toEqual(b);
  });

  it('is vertically symmetric', () => {
    const cells = identiconCells('webllm:Llama-3.2-1B');
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        expect(cells[row * N + col]).toBe(cells[row * N + (N - 1 - col)]);
      }
    }
  });

  it('always renders something (never a blank mark)', () => {
    for (const seed of ['', 'human', 'a', 'ollama:qwen2.5:3b']) {
      expect(identiconCells(seed).some(Boolean)).toBe(true);
    }
  });

  it('produces exactly SIZE² cells', () => {
    expect(identiconCells('x')).toHaveLength(N * N);
  });
});
