import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';

/**
 * In-memory sliding-window rate limiter per IP (SPEC §14). Single-process — fine
 * for one VPS instance. Behind a proxy, X-Forwarded-For is trusted only when
 * TRUSTED_PROXY=true (SPEC §14).
 */
const windows = new Map<string, number[]>();

export function checkRate(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): boolean {
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  return true;
}

/** Test helper. */
export function resetRateLimits(): void {
  windows.clear();
}

export function clientIp(c: Context, trustedProxy: boolean): string {
  if (trustedProxy) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim();
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function rateLimit(
  bucket: string,
  limitPerHour: number,
  opts: { trustedProxy: boolean; now?: () => number },
): MiddlewareHandler {
  const windowMs = 60 * 60 * 1000;
  return async (c, next) => {
    const now = (opts.now ?? Date.now)();
    const ip = clientIp(c, opts.trustedProxy);
    if (!checkRate(`${bucket}:${ip}`, limitPerHour, windowMs, now)) {
      return c.json({ error: 'rate_limited' }, 429);
    }
    await next();
  };
}
