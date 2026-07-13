/**
 * Native Gemini transport for the funded AI coach (§12.1).
 *
 * This is the ONLY place the owner's Gemini key is used, and it lives server-side
 * so the browser never sees it. Talks to the native Generative Language API
 * (generativelanguage.googleapis.com), which has a different shape from the
 * OpenAI-compatible OpenRouter API — hence a dedicated adapter, not a base-URL
 * swap. `fetchImpl` is injectable so the route can be tested without a network.
 */
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
}

export interface GeminiRequest {
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** One turn → the model's text. Throws on a non-2xx or a network/abort error. */
export async function generateGemini(cfg: GeminiConfig, req: GeminiRequest): Promise<string> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const res = await doFetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header form (not ?key=) keeps the secret out of URLs and logs.
        'x-goog-api-key': cfg.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.7,
          maxOutputTokens: req.maxOutputTokens ?? 120,
          // Gemini 2.5/3.x Flash "think" by default and would spend the whole
          // token budget on hidden reasoning, returning an empty comment
          // (finishReason MAX_TOKENS). A 2-sentence quip needs no reasoning, so
          // turn it off — cheaper and it actually answers.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      ...(req.signal ? { signal: req.signal } : {}),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return text.trim();
}
