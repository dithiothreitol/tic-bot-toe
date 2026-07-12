import { Hono } from 'hono';

import { verifySession, verifyStartToken } from '../auth/jwt';
import {
  type PlayerRecord,
  hashPlayerToken,
  isValidPlayerToken,
  resolvePlayer,
} from '../auth/player';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { resultPayloadSchema, usesReservedSubjectId } from '../db/result-schema';
import { type ResultPayload, submitResult } from '../db/results';
import { clientIp } from '../middleware/rate-limit';

/**
 * POST /api/result — save a match (SPEC §14/§15). JWT required, one-time jti,
 * server replay + sanity + dedup, transactional ratings update when lab=false.
 */
export function resultRoute(deps: { db: Database; config: Config; now?: () => number }): Hono {
  const app = new Hono();
  app.post('/', async (c) => {
    const auth = c.req.header('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const claims = await verifySession(deps.config.jwtSecret, token);
    if (!claims) return c.json({ error: 'unauthorized' }, 401);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }

    // Validate the shape before touching it (§15) — an unvalidated payload
    // (e.g. a move with no `telemetry`) would blow up mid-aggregation as a 500.
    const parsed = resultPayloadSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'bad_payload' }, 400);
    const payload = parsed.data as ResultPayload;

    // `human:<id>` is the server's namespace, minted from a verified player
    // token. Accepting it from the client would let anyone write into another
    // person's ranking row AND skip every anti-bot layer (the human side is
    // detected by the literal id 'human').
    if (usesReservedSubjectId(payload)) {
      return c.json({ error: 'reserved_subject_id' }, 400);
    }

    // Optional pseudonymous identity: resolves the human side to one ranking row.
    let player: PlayerRecord | null = null;
    const playerToken = c.req.header('x-player-token');
    if (playerToken) {
      if (!isValidPlayerToken(playerToken)) {
        return c.json({ error: 'bad_player_token' }, 400);
      }
      player = await resolvePlayer(deps.db, playerToken);
    }

    // Match-start proof (§15.3). An invalid/expired token is treated as absent;
    // submitResult decides whether this match actually needed one.
    const start = payload.startToken
      ? await verifyStartToken(deps.config.jwtSecret, payload.startToken)
      : null;

    // The start token must have been issued to THIS identity, otherwise start
    // tokens could be minted anonymously (or under a throwaway identity), aged,
    // and then spent by whichever identity is being farmed.
    if (start) {
      const expectedSub = playerToken ? hashPlayerToken(playerToken) : null;
      if (start.sub !== expectedSub) {
        return c.json({ error: 'start_token_mismatch' }, 422);
      }
    }

    const ip = clientIp(c, deps.config.trustedProxy);
    const result = await submitResult(deps.db, claims.jti, payload, ip, {
      player,
      start,
      now: deps.now,
    });
    if (!result.ok) return c.json({ error: result.reason }, result.code);
    return c.json({
      matchId: result.matchId,
      winner: result.winner,
      lab: result.lab,
      ranked: result.ranked,
      unrankedReason: result.unrankedReason,
      ratingChanges: result.ratingChanges,
    });
  });
  return app;
}
