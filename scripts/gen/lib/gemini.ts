/**
 * Minimal Google Gemini image-generation client — REST, no SDK.
 *
 * Mirrors the grzybiarz-mono technique: POST `:generateContent` with
 * `responseModalities: ['TEXT','IMAGE']`, then decode the inline base64 image
 * part of the first candidate. Size / aspect / seed are NOT sent (the API
 * ignores them) — enforce dimensions downstream with sharp (see ./sharp).
 */

const API_HOST = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface InlineImage {
  mimeType: string;
  data: Buffer;
}

export interface GenerateOptions {
  /** Extra inline images for edit / img2img. Order matters vs the prompt text. */
  images?: InlineImage[];
  /** Override the model for this single call. */
  model?: string;
  /** Max attempts on 429 / 5xx (default 4). */
  maxRetries?: number;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set — copy .env.example to .env and fill it in.');
  }
  return key;
}

function modelId(override?: string): string {
  return override ?? process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3-pro-image-preview';
}

// ---- client-side rate limiting (preview image tiers are ~10 rpm) -----------
const RPM = Number(process.env.GEMINI_RPM ?? 10);
const MIN_INTERVAL_MS = Math.round(60_000 / Math.max(1, RPM));
let lastCallAt = 0;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/**
 * Generate (or edit, when `opts.images` are supplied) a single image.
 * Returns the raw image bytes; write/resize them with the sharp helpers.
 */
export async function generateImage(prompt: string, opts: GenerateOptions = {}): Promise<Buffer> {
  const parts: GeminiPart[] = [{ text: prompt }];
  for (const img of opts.images ?? []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data.toString('base64') } });
  }
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  });
  const url = `${API_HOST}/${modelId(opts.model)}:generateContent?key=${apiKey()}`;
  const maxRetries = opts.maxRetries ?? 4;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await throttle();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (res.ok) {
      return decodeImage((await res.json()) as GeminiResponse);
    }
    const retryable = res.status === 429 || res.status >= 500;
    const detail = await res.text().catch(() => '');
    if (!retryable || attempt === maxRetries) {
      throw new Error(`Gemini ${res.status} ${res.statusText}: ${detail.slice(0, 500)}`);
    }
    const backoff = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
    console.warn(`  ↻ ${res.status}; retrying (${attempt}/${maxRetries - 1}) in ${backoff}ms`);
    await sleep(backoff);
  }
  throw new Error('unreachable');
}

function decodeImage(json: GeminiResponse): Buffer {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData?.mimeType?.startsWith('image/')) {
      return Buffer.from(p.inlineData.data, 'base64');
    }
  }
  const text = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);
  throw new Error(`No image in Gemini response${text ? ` (model replied: "${text}")` : ''}.`);
}
