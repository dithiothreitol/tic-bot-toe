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
    if (typeof payload.jti !== 'string' || typeof payload.exp !== 'number') {
      return null;
    }
    return { jti: payload.jti, exp: payload.exp };
  } catch {
    return null;
  }
}
