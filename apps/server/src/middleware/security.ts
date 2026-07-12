import type { MiddlewareHandler } from 'hono';

/**
 * Security headers (SPEC §16). CSP pins the browser's outbound reach: only
 * openrouter.ai (BYOK), Turnstile, and the MLC/HF CDNs (WebLLM weights).
 * 'wasm-unsafe-eval' + blob worker are required by web-llm's WASM runtime.
 */
const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://openrouter.ai https://challenges.cloudflare.com https://huggingface.co https://*.huggingface.co https://raw.githubusercontent.com https://*.mlc.ai",
  "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "img-src 'self' data: blob:",
  // The recorded match clip. It would already be allowed via default-src, but
  // pinning it here keeps media independent of any future default-src change.
  "media-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('Content-Security-Policy', CSP);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  };
}
