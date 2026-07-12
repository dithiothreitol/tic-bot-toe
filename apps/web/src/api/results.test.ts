import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchOutcome } from '@/game/orchestrator';
import { useSettings } from '@/store/settings';

import { saveResult } from './results';

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
