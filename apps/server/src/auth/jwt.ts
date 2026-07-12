import { randomUUID } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

/**
 * Session JWT (SPEC §14): HS256, 30-min TTL, unique `jti`. Issued after a
 * Turnstile check; the one-time `jti` is later burned on result submission
 * (Stage 6) so a session token cannot save two matches.
 */
export interface SessionClaims {
  jti: string;
  exp: number;
}

/**
 * Match-start token (SPEC §15.3, anti-bot pacing). Issued when a human match
 * begins; `iat` is the server's own clock reading, so at save time we can tell
 * how long the person actually spent playing. A bot that fabricates fast
 * telemetry still cannot fabricate elapsed wall-clock time.
 */
export interface StartClaims {
  jti: string;
  /** Issued-at, seconds since epoch (server clock). */
  iat: number;
}

const START_TYP = 'start';

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export function newJti(): string {
  return randomUUID();
}

export async function signSession(
  secret: string,
  ttlSeconds: number,
  jti: string = newJti(),
): Promise<{ token: string; jti: string }> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keyFrom(secret));
  return { token, jti };
}

export async function verifySession(
  secret: string,
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: ['HS256'],
    });
    // A match-start token must never be usable as a session token.
    if (payload.typ === START_TYP) return null;
    if (typeof payload.jti !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    return { jti: payload.jti, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Sign a match-start token; its `jti` is burned on result submission. */
export async function signStartToken(
  secret: string,
  ttlSeconds: number,
  jti: string = newJti(),
): Promise<{ token: string; jti: string }> {
  const token = await new SignJWT({ typ: START_TYP })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keyFrom(secret));
  return { token, jti };
}

export async function verifyStartToken(
  secret: string,
  token: string,
): Promise<StartClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      algorithms: ['HS256'],
    });
    if (payload.typ !== START_TYP) return null;
    if (typeof payload.jti !== 'string' || typeof payload.iat !== 'number') {
      return null;
    }
    return { jti: payload.jti, iat: payload.iat };
  } catch {
    return null;
  }
}
