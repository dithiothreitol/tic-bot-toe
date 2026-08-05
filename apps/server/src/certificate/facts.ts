/**
 * Everything a certificate asserts, resolved from the database (plan §3).
 *
 * The client sends ONE thing — a match id in the URL. Name, opponent, date,
 * move count and streak are all read here, so there is no parameter anywhere
 * that could change what the document claims.
 *
 * THE STREAK IS NOT STORED, AND DOES NOT NEED TO BE. `streakFrom` counts back
 * from a given day, and `POST /api/daily/result` only ever inserts a row for
 * TODAY — no day can be added retroactively. So the streak "as of day D",
 * recomputed a year later, is byte-identical to the one issued on the day, and
 * a certificate can be regenerated forever without a snapshot column.
 */
import { type GameId, streakFrom } from '@arena/game-core';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { dailyResults, matches, players } from '../db/schema';
import { finalState, initialState, short } from '../og/boards';

export interface CertificateFacts {
  matchId: string;
  /** The challenge day (`YYYY-MM-DD`), not the day the PDF was downloaded. */
  day: string;
  /** `null` when the player never claimed a nickname — copy supplies a label. */
  playerName: string | null;
  opponentId: string;
  /** `opponentId` without the provider prefix, as shown on the document. */
  opponentLabel: string;
  game: GameId;
  variant: string;
  /** Consecutive completed days ending on `day`. */
  streak: number;
  moveCount: number;
  movesHashPrefix: string;
  /** Reconstructed final position, or `null` when it cannot be replayed. */
  final: unknown;
}

/** Short, human-readable slice of the match UUID (also used in the filename). */
export function shortMatchId(matchId: string): string {
  return matchId.replace(/-/g, '').slice(0, 8);
}

/**
 * `null` when this match did not complete a daily challenge — that is a 404,
 * not an error: most matches simply are not certificates.
 */
export async function factsFor(db: Database, matchId: string): Promise<CertificateFacts | null> {
  const claims = await db
    .select({ day: dailyResults.day, playerToken: dailyResults.playerToken })
    .from(dailyResults)
    .where(and(eq(dailyResults.matchId, matchId), eq(dailyResults.completed, true)))
    .limit(1);
  const claim = claims[0];
  if (!claim) return null;

  const rows = await db
    .select({
      game: matches.game,
      variant: matches.variant,
      p1Id: matches.p1Id,
      p2Id: matches.p2Id,
      winner: matches.winner,
      setup: matches.setup,
      moves: matches.moves,
      movesHash: matches.movesHash,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  const match = rows[0];
  // A daily_results row referencing a purged match: treat as no certificate
  // rather than rendering a document with holes in it.
  if (!match) return null;

  const named = await db
    .select({ nickname: players.nickname })
    .from(players)
    .where(eq(players.tokenHash, claim.playerToken))
    .limit(1);

  const days = await db
    .select({ day: dailyResults.day })
    .from(dailyResults)
    .where(and(eq(dailyResults.playerToken, claim.playerToken), eq(dailyResults.completed, true)));

  // The board is the certificate's evidence, so it always shows: the real final
  // position when the match replays, and the game's EMPTY board — its pictogram
  // — when it does not. An empty grid asserts nothing; inventing a position
  // would, and this document's one rule is that it never states a false fact.
  const asOg = { ...match, game: match.game as GameId };
  let final: unknown = null;
  try {
    final = finalState(asOg);
  } catch {
    try {
      final = initialState(asOg);
    } catch {
      // Unknown game id → certificate without the thumbnail (§2.11).
    }
  }

  return {
    matchId,
    day: claim.day,
    playerName: named[0]?.nickname ?? null,
    opponentId: match.p2Id,
    opponentLabel: short(match.p2Id),
    game: match.game as GameId,
    variant: match.variant,
    streak: streakFrom(
      days.map((d) => d.day),
      claim.day,
    ),
    moveCount: Array.isArray(match.moves) ? match.moves.length : 0,
    movesHashPrefix: match.movesHash.slice(0, 12),
    final,
  };
}
