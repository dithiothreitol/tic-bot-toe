import { fireEvent, render, screen } from '@testing-library/react';

import { getGame } from '@arena/game-core';

import type { MatchConfig } from '@/components/GameRunner';
import { pl } from '@/i18n/pl';

import { GameRunner, ratingRow } from './GameRunner';

// The only I/O the human-battleship path touches before a save: the anti-bot
// start token and the live-counter heartbeat. Stub both so the test is hermetic
// (no network, no timers left running against a real endpoint).
vi.mock('@/api/match', () => ({
  fetchStartToken: vi.fn().mockResolvedValue('start-token'),
}));
vi.mock('@/api/live', () => ({
  pingLive: vi.fn().mockResolvedValue(undefined),
  reportFinish: vi.fn().mockResolvedValue(undefined),
  stopLive: vi.fn(),
}));

/**
 * Human battleship: p1 is the person, p2 is a second human so the real
 * orchestrator emits the opening snapshot and then simply waits for input — no
 * LLM, no network. That exercises the exact placement → play transition where a
 * misplaced hook once threw React error #310 ("ciemność widzę" after placing the
 * fleet). See GameRunner.tsx: the thought-stream toggle hook MUST stay above the
 * `needsPlacement` early return, or the hook count changes when the gate clears.
 */
function battleshipConfig(): MatchConfig {
  return {
    game: 'battleship',
    variant: getGame('battleship').variants[0]!,
    mode: 'human_vs_model',
    p1: { kind: 'human', displayName: 'You' },
    p2: { kind: 'human', displayName: 'Also you' },
    names: { p1: 'You', p2: 'Also you' },
    seed: 1,
  };
}

describe('GameRunner — human battleship placement → play', () => {
  it('renders the shooting board after the fleet is confirmed (no hook-count crash)', async () => {
    render(<GameRunner config={battleshipConfig()} onExit={() => {}} />);

    // 1. We land on ship placement, and "Ready" is gated on a full fleet.
    expect(screen.getByText(pl.placement.title)).toBeInTheDocument();
    const ready = screen.getByRole('button', { name: new RegExp(`^${pl.placement.ready}$`, 'i') });
    expect(ready).toBeDisabled();

    // 2. Auto-place the whole fleet, then confirm.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(pl.placement.random, 'i') }));
    expect(await screen.findByText(pl.placement.allPlaced)).toBeInTheDocument();
    expect(ready).toBeEnabled();
    fireEvent.click(ready);

    // 3. The play view renders — both the own fleet and the tracking grid.
    //    Before the fix this render threw React #310 and showed a blank screen.
    expect(await screen.findByText(pl.battleship.yourFleet)).toBeInTheDocument();
    expect(screen.getByText(pl.battleship.yourShots)).toBeInTheDocument();
  });
});

/**
 * The rating card reads `real` Elo and prints it rounded. It used to round `before`,
 * `after` and the raw delta independently, which let the arrow and the delta disagree
 * ("1000 → 1001 (+0)"). Whatever the stored precision, the row must stay self-consistent:
 * after - before === delta, always.
 */
describe('ratingRow — the post-match Elo row never contradicts itself', () => {
  it.each([
    // [before, after, expected label] — a draw at 1000 vs 1014 (the reported match:
    // Elo really moves by ±0.64, because a draw against a higher rating is a gain).
    [1000, 1000.6444, '+1'],
    [1014, 1013.3556, '-1'],
    // Fractional `before` — the combinations that used to print a contradiction.
    [1000.4, 1000.584, '+1'], // old code: "1000 → 1001 (+0)"
    [1000.6, 1001.2, '+0'], // old code: "1001 → 1001 (+1)"
    [1000.6, 1000.803, '+0'],
  ])('%s → %s renders as (%s)', (before, after, label) => {
    const row = ratingRow(before, after);
    expect(row.deltaLabel).toBe(label);
    expect(row.after - row.before).toBe(row.delta);
  });

  it('a draw between equal ratings shows no movement at all', () => {
    expect(ratingRow(1000, 1000)).toMatchObject({ before: 1000, after: 1000, delta: 0, deltaLabel: '+0' });
  });

  it('stays zero-sum on a decided game', () => {
    const win = ratingRow(1000, 1016);
    const loss = ratingRow(1000, 984);
    expect(win.deltaLabel).toBe('+16');
    expect(loss.deltaLabel).toBe('-16');
    expect(win.delta + loss.delta).toBe(0);
  });
});
