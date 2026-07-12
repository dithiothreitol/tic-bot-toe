import { Hono } from 'hono';

import { signStartToken } from '../auth/jwt';
import { hashPlayerToken, isValidPlayerToken } from '../auth/player';
import type { Config } from '../config';

/**
 * POST /api/match/start — hand out a match-start token (SPEC §15.3).
 *
 * This is the anti-bot pacing anchor: the token carries the server's `iat`, so
 * when the result is submitted we know how much real time actually elapsed. A
 * script can fake per-move latency in the payload, but it cannot fake the clock.
 * No Turnstile here — it is a silent fetch at match start, only rate limited.
 *
 * The token is bound to the caller's identity (`sub` = SHA-256 of the player
 * token) so start tokens cannot be pooled across throwaway identities. No DB
 * access: the binding is a hash, so issuing a token never creates a player row.
 */
export function matchStartRoute(deps: { config: Config }): Hono {
  const app = new Hono();
  app.post('/start', async (c) => {
    const playerToken = c.req.header('x-player-token');
    if (playerToken && !isValidPlayerToken(playerToken)) {
      return c.json({ error: 'bad_player_token' }, 400);
    }
    const sub = playerToken ? hashPlayerToken(playerToken) : null;

    const { token } = await signStartToken(
      deps.config.jwtSecret,
      deps.config.startTtlSeconds,
      sub,
    );
    return c.json({ startToken: token, expiresIn: deps.config.startTtlSeconds });
  });
  return app;
}
