import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchOutcome } from '@/game/orchestrator';
import { useSettings } from '@/store/settings';

import { buildResultPayload, saveResult } from './results';

// A valid session is already in hand, so saveResult never opens Turnstile.
vi.mock('@/store/session', () => ({
  ensureSession: () => Promise.resolve('jwt-token'),
}));

function outcome(mode: MatchOutcome['mode'], p1Id: string): MatchOutcome {
  return {
    mode,
    game: 'tictactoe',
    variant: 'standard',
    p1Id,
    p2Id: 'openrouter:b',
    winner: 'p1',
    aborted: false,
    moves: [],
    setup: null,
  } as unknown as MatchOutcome;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ matchId: 'm1', winner: 'p1', lab: false, ratingChanges: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const headersOf = () =>
  (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;

describe('saveResult identity header (SPEC §10)', () => {
  it('sends X-Player-Token in human_vs_model so the person keeps one ranking row', async () => {
    const token = useSettings.getState().playerToken;
    await saveResult(outcome('human_vs_model', 'human'));
    expect(headersOf()['x-player-token']).toBe(token);
    expect(headersOf().authorization).toBe('Bearer jwt-token');
  });

  it('does NOT send X-Player-Token in model_vs_model (no person involved)', async () => {
    await saveResult(outcome('model_vs_model', 'openrouter:a'));
    expect(headersOf()['x-player-token']).toBeUndefined();
  });
});

describe('buildResultPayload carries Module A/B fields (D4)', () => {
  function outcomeWithMoves(): MatchOutcome {
    return {
      ...outcome('model_vs_model', 'openrouter:a'),
      moves: [
        {
          index: 0,
          player: 'p1',
          move: 0,
          telemetry: { latencyMs: 100, retries: 1, forfeit: false },
          thoughts: 'center is strong',
          rejections: [{ kind: 'illegal', reason: 'occupied', attempted: '4' }],
        },
        {
          index: 1,
          player: 'p2',
          move: 1,
          telemetry: { latencyMs: 90, retries: 0, forfeit: false },
        },
      ],
    } as unknown as MatchOutcome;
  }

  it('copies thoughts/rejections when present and omits them when absent', () => {
    const payload = buildResultPayload(outcomeWithMoves());
    expect(payload.moves[0]!.thoughts).toBe('center is strong');
    expect(payload.moves[0]!.rejections).toHaveLength(1);
    // A move without a trace must not gain the keys — keeps legacy payloads clean.
    expect(payload.moves[1]).not.toHaveProperty('thoughts');
    expect(payload.moves[1]).not.toHaveProperty('rejections');
  });
});

describe('saveResult start token (SPEC §15.3)', () => {
  const bodyOf = () => JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);

  it('carries the match-start token in the body — a ranked human match needs it', async () => {
    await saveResult(outcome('human_vs_model', 'human'), { startToken: 'start-jwt' });
    // The bug this guards: the token was accepted as an option, then dropped
    // before the POST, so every browser human save 422'd as missing_start_token.
    expect(bodyOf().startToken).toBe('start-jwt');
  });
});
