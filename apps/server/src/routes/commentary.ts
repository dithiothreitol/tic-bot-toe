import { type CommentRequest, buildCommentaryPrompt, trimToTwoSentences } from '@arena/game-core';
import { Hono } from 'hono';
import { z } from 'zod';

import { type GeminiConfig, generateGemini } from '../providers/gemini';

/**
 * POST /api/commentary — the funded AI coach (§12.1).
 *
 * Mounted ONLY when GEMINI_API_KEY is set, and rate-limited (app.ts): every call
 * spends the owner's Gemini credits, so the endpoint is a liability if left open.
 * Two things keep it from becoming an arbitrary-text proxy:
 *   1. the body is a VALIDATED, structured move description — never a free prompt;
 *   2. the prompt is built HERE, by the same game-core builder the client uses.
 * The worst a caller can do is request commentary on a board they made up.
 */

const move = z.union([z.number().finite(), z.string().max(20)]);

const commentarySchema = z.object({
  locale: z.enum(['pl', 'en']).default('pl'),
  game: z.enum(['tictactoe', 'battleship', 'sudoku']),
  moveIndex: z.number().int().nonnegative().max(500),
  player: z.enum(['p1', 'p2']),
  playerName: z.string().min(1).max(120),
  move,
  quality: z.enum(['optimal', 'good', 'weak', 'blunder']),
  // The board snapshot the god view renders. Untrusted and only stringified into
  // the prompt, so its shape is the client's problem — worst case, odd commentary.
  state: z.unknown(),
  isFinal: z.boolean(),
  winnerName: z.string().max(120).nullable().optional(),
});

export interface CommentaryDeps {
  gemini: Pick<GeminiConfig, 'apiKey' | 'model'>;
  /** Injectable generator (tests) — defaults to the real Gemini call. */
  generate?: typeof generateGemini;
}

export function commentaryRoute(deps: CommentaryDeps): Hono {
  const generate = deps.generate ?? generateGemini;
  const app = new Hono();

  app.post('/', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }
    const parsed = commentarySchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: 'bad_request' }, 400);

    const { locale, ...rest } = parsed.data;

    // `state` is z.unknown() on purpose (the god-view render is the client's
    // concern) — so a malformed board can make the render throw. Guard it here,
    // or an untrusted body would 500 the server instead of failing cleanly.
    let prompt: { system: string; user: string };
    try {
      prompt = buildCommentaryPrompt(rest as CommentRequest, locale);
    } catch {
      return c.json({ error: 'bad_request' }, 400);
    }

    try {
      const text = trimToTwoSentences(await generate(deps.gemini, prompt));
      return c.json({ text, model: deps.gemini.model });
    } catch {
      // The coach is decoration; a provider hiccup is not a server error.
      return c.json({ error: 'coach_unavailable' }, 502);
    }
  });

  return app;
}
