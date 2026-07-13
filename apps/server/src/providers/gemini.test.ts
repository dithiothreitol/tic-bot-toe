import { describe, expect, it, vi } from 'vitest';

import { GEMINI_BASE, generateGemini } from './gemini';

const cfg = { apiKey: 'k-secret', model: 'gemini-3.5-flash' };

describe('generateGemini', () => {
  it('calls the native endpoint with the key in a header, not the URL', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${GEMINI_BASE}/models/gemini-3.5-flash:generateContent`);
      expect(url).not.toContain('k-secret'); // key must never be in the URL
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('k-secret');
      const body = JSON.parse(init?.body as string);
      expect(body.systemInstruction.parts[0].text).toContain('commentator');
      expect(body.contents[0].parts[0].text).toBe('the move');
      expect(body.generationConfig.maxOutputTokens).toBe(120);
      // Thinking off — a 2-sentence quip must not burn the budget on reasoning.
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '  Świetny ruch.  ' }] } }] }),
        { status: 200 },
      );
    });

    const text = await generateGemini(
      { ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch },
      { system: 'You are a commentator.', user: 'the move' },
    );
    expect(text).toBe('Świetny ruch.'); // trimmed
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('joins multi-part candidate text', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'A ' }, { text: 'B' }] } }] }),
          { status: 200 },
        ),
    );
    const text = await generateGemini(
      { ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch },
      { system: 's', user: 'u' },
    );
    expect(text).toBe('A B');
  });

  it('throws on a non-2xx so the route can fall back cleanly', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 429 }));
    await expect(
      generateGemini(
        { ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch },
        { system: 's', user: 'u' },
      ),
    ).rejects.toThrow(/Gemini 429/);
  });

  it('returns empty string when the model returns no candidates', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const text = await generateGemini(
      { ...cfg, fetchImpl: fetchImpl as unknown as typeof fetch },
      { system: 's', user: 'u' },
    );
    expect(text).toBe('');
  });
});
