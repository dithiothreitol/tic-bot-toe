import { describe, expect, it, vi } from 'vitest';

import { commentaryRoute } from './commentary';

const gemini = { apiKey: 'k', model: 'gemini-3.5-flash' };

const validBody = {
  locale: 'en',
  game: 'tictactoe',
  moveIndex: 2,
  player: 'p1',
  playerName: 'gpt-4o-mini',
  move: 4,
  quality: 'blunder',
  state: { board: [null, null, null, null, 'X', null, null, null, null] },
  isFinal: false,
};

function post(app: ReturnType<typeof commentaryRoute>, body: unknown) {
  return app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/commentary', () => {
  it('builds the prompt server-side and returns the generated text', async () => {
    const generate = vi.fn(async (_cfg, req: { system: string; user: string }) => {
      // Prompt built HERE from structured input, not sent by the client.
      expect(req.system).toContain('Write in ENGLISH.');
      expect(req.user).toContain('Move 3: gpt-4o-mini played 4');
      expect(req.user).toContain('blunder');
      return 'One sentence. Two sentence. Three sentence.';
    });
    const app = commentaryRoute({ gemini, generate });

    const res = await post(app, validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string; model: string };
    // Trimmed to two sentences (§12.1).
    expect(json.text).toBe('One sentence. Two sentence.');
    expect(json.model).toBe('gemini-3.5-flash');
    expect(generate).toHaveBeenCalledOnce();
  });

  it('rejects a malformed body with 400 and never calls Gemini', async () => {
    const generate = vi.fn();
    const app = commentaryRoute({ gemini, generate });

    for (const bad of [
      {}, // missing fields
      { ...validBody, game: 'chess' }, // unknown game
      { ...validBody, quality: 'meh' }, // unknown quality
      { ...validBody, moveIndex: -1 }, // out of range
    ]) {
      expect((await post(app, bad)).status).toBe(400);
    }
    // The whole point: a bad request can't reach the owner's Gemini key.
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns 400 (not 500) when the board state is malformed — it is untrusted', async () => {
    const generate = vi.fn();
    // A battleship request whose state is not a real BattleshipState: the god-view
    // render throws, and that must not crash the server.
    const res = await post(commentaryRoute({ gemini, generate }), {
      ...validBody,
      game: 'battleship',
      move: 'C4',
      state: { nonsense: true },
    });
    expect(res.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it('defaults the locale to Polish when omitted', async () => {
    const generate = vi.fn(async (_cfg, req: { system: string }) => {
      expect(req.system).toContain('Write in POLISH.');
      return 'ok.';
    });
    const { locale: _drop, ...noLocale } = validBody;
    const res = await post(commentaryRoute({ gemini, generate }), noLocale);
    expect(res.status).toBe(200);
  });

  it('returns 502 (not 500) when Gemini fails — the coach is decoration', async () => {
    const generate = vi.fn(async () => {
      throw new Error('Gemini 429');
    });
    const res = await post(commentaryRoute({ gemini, generate }), validBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'coach_unavailable' });
  });
});
