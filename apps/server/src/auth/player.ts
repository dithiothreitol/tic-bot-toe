import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { players } from '../db/schema';

/**
 * Player identity (SPEC §10/§16). The client holds a random bearer secret in
 * localStorage and sends it as `X-Player-Token`; we persist only its SHA-256, so
 * a DB leak never reveals the token. The secret keeps every match by the same
 * person under one ranking row. No accounts, no PII.
 */
export interface PlayerRecord {
  id: string;
  nickname: string | null;
  flaggedAt: Date | null;
}

/** SHA-256 hex of the raw bearer token — the only form we store. */
export function hashPlayerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Accept both the legacy UUID token (already in some browsers' localStorage) and
 * the stronger base64url secret new clients generate. Charset-restricted and
 * length-bounded so it is safe to hash and store.
 */
export function isValidPlayerToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

/**
 * Look up a player WITHOUT creating one. Used by read-only endpoints so a plain
 * GET never mutates the database (and so a scripted sweep of random tokens
 * cannot mint rows).
 */
export async function findPlayer(db: Database, token: string): Promise<PlayerRecord | null> {
  const rows = await db
    .select({ id: players.id, nickname: players.nickname, flaggedAt: players.flaggedAt })
    .from(players)
    .where(eq(players.tokenHash, hashPlayerToken(token)));
  return rows[0] ?? null;
}

/**
 * Resolve (or lazily create) the player for a raw token. Race-safe: the insert
 * is a no-op if the hash already exists, then we read the row back. Only for
 * endpoints that legitimately establish identity (saving a result, claiming a
 * nickname) — never for reads.
 */
export async function resolvePlayer(db: Database, token: string): Promise<PlayerRecord> {
  const tokenHash = hashPlayerToken(token);
  await db.insert(players).values({ tokenHash }).onConflictDoNothing({ target: players.tokenHash });
  const rows = await db
    .select({ id: players.id, nickname: players.nickname, flaggedAt: players.flaggedAt })
    .from(players)
    .where(eq(players.tokenHash, tokenHash));
  return rows[0]!;
}
